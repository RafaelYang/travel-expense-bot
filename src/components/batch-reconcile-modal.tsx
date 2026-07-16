"use client"

import { useMemo, useState } from "react"
import * as Dialog from "@radix-ui/react-dialog"
import { CheckCircle2, CreditCard, Loader2, X } from "lucide-react"
import { format } from "date-fns"

import { useLanguage } from "@/components/language-provider"
import {
  buildReconciliationPayload,
  getInitialActualCharge,
  isForeignCardExpense,
} from "@/lib/expense-reconciliation"
import { getCurrencySymbol } from "@/lib/utils"

export interface BatchReconcileExpense {
  id: string
  item: string
  amount: number
  currency: string
  convertedAmount?: number | null
  settledAmount?: number | null
  date: string
  paymentMethod: "card" | "cash"
  reconciledAt?: string
  user: { name: string }
}

function initialActualCharges(expenses: BatchReconcileExpense[]) {
  return Object.fromEntries(
    expenses.map((expense) => [
      expense.id,
      getInitialActualCharge(expense.settledAmount),
    ]),
  )
}

export function BatchReconcileModal({
  tripId,
  baseCurrency,
  expenses,
  onClose,
  onSaved,
}: {
  tripId: string
  baseCurrency: string
  expenses: BatchReconcileExpense[]
  onClose: () => void
  onSaved: () => Promise<void>
}) {
  const { t } = useLanguage()
  const pendingExpenses = useMemo(
    () => expenses
      .filter((expense) => expense.paymentMethod === "card" && !expense.reconciledAt)
      .sort((left, right) => new Date(right.date).getTime() - new Date(left.date).getTime()),
    [expenses],
  )
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [actualCharges, setActualCharges] = useState<Record<string, string>>(
    () => initialActualCharges(pendingExpenses),
  )
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({})
  const [resultMessage, setResultMessage] = useState("")
  const [submitting, setSubmitting] = useState(false)

  const selectedSet = new Set(selectedIds)
  const selectedExpenses = pendingExpenses.filter((expense) => selectedSet.has(expense.id))
  const invalidSelectedIds = new Set(
    selectedExpenses
      .filter((expense) => !buildReconciliationPayload(
        expense,
        baseCurrency,
        actualCharges[expense.id],
      ).ok)
      .map((expense) => expense.id),
  )
  const allSelected = pendingExpenses.length > 0 &&
    pendingExpenses.every((expense) => selectedSet.has(expense.id))

  const toggleSelected = (expenseId: string, selected: boolean) => {
    setSelectedIds((current) => selected
      ? [...new Set([...current, expenseId])]
      : current.filter((id) => id !== expenseId))
    setRowErrors((current) => {
      const next = { ...current }
      delete next[expenseId]
      return next
    })
    setResultMessage("")
  }

  const updateActualCharge = (expenseId: string, value: string) => {
    setActualCharges((current) => ({ ...current, [expenseId]: value }))
    if (value.trim()) toggleSelected(expenseId, true)
  }

  const toggleAll = () => {
    setSelectedIds(allSelected ? [] : pendingExpenses.map((expense) => expense.id))
    setRowErrors({})
    setResultMessage("")
  }

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (selectedExpenses.length === 0 || invalidSelectedIds.size > 0) return

    setSubmitting(true)
    setRowErrors({})
    setResultMessage("")

    const requests = selectedExpenses.map(async (expense) => {
      const payloadResult = buildReconciliationPayload(
        expense,
        baseCurrency,
        actualCharges[expense.id],
      )
      if (!payloadResult.ok) {
        throw new Error(t("expense.reconcile.batch.actualRequired"))
      }

      const response = await fetch(`/api/trips/${tripId}/expenses/${encodeURIComponent(expense.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payloadResult.payload),
      })
      if (!response.ok) {
        const data = await response.json().catch(() => null)
        throw new Error(data?.error || t("expense.reconcile.toggleError"))
      }
    })

    const results = await Promise.allSettled(requests)
    const failures: Record<string, string> = {}
    results.forEach((result, index) => {
      if (result.status === "rejected") {
        failures[selectedExpenses[index].id] = result.reason instanceof Error
          ? result.reason.message
          : t("expense.reconcile.toggleError")
      }
    })

    const failedIds = Object.keys(failures)
    const successCount = selectedExpenses.length - failedIds.length
    await onSaved()

    if (failedIds.length === 0) {
      onClose()
      return
    }

    setRowErrors(failures)
    setSelectedIds(failedIds)
    setResultMessage(t("expense.reconcile.batch.partial", {
      success: String(successCount),
      failed: String(failedIds.length),
    }))
    setSubmitting(false)
  }

  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open && !submitting) onClose()
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay style={{
          position: "fixed", inset: 0, zIndex: 20000,
          background: "rgba(0, 0, 0, 0.58)",
          backdropFilter: "blur(4px)", WebkitBackdropFilter: "blur(4px)",
        }} />
        <Dialog.Content
          className="glass-card trip-modal batch-reconcile-modal"
          onEscapeKeyDown={(event) => { if (submitting) event.preventDefault() }}
          onPointerDownOutside={(event) => { if (submitting) event.preventDefault() }}
          style={{
            position: "fixed", top: "50%", left: "50%", zIndex: 20001,
            transform: "translate(-50%, -50%)",
            width: "calc(100vw - 2rem)", maxWidth: "720px", maxHeight: "86vh",
            padding: "1.25rem", display: "flex", flexDirection: "column",
            overflow: "hidden",
          }}
        >
          <div style={{
            display: "flex", alignItems: "flex-start", justifyContent: "space-between",
            gap: "1rem", marginBottom: "0.35rem", flexShrink: 0,
          }}>
            <div>
              <Dialog.Title style={{
                display: "flex", alignItems: "center", gap: "0.5rem",
                fontSize: "1.12rem", fontWeight: 800, margin: 0,
              }}>
                <CheckCircle2 size={20} style={{ color: "var(--color-primary)" }} />
                {t("expense.reconcile.batch.title")}
              </Dialog.Title>
              <Dialog.Description style={{
                margin: "0.4rem 0 0", color: "var(--text-secondary)",
                fontSize: "0.8rem", lineHeight: 1.5,
              }}>
                {t("expense.reconcile.batch.desc")}
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <button
                type="button" className="btn-nav" disabled={submitting}
                aria-label={t("settings.delete.cancel")}
                style={{ padding: "0.4rem", flexShrink: 0 }}
              >
                <X size={18} />
              </button>
            </Dialog.Close>
          </div>

          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            gap: "0.75rem", margin: "0.65rem 0", flexShrink: 0,
          }}>
            <span style={{ color: "var(--text-secondary)", fontSize: "0.82rem", fontWeight: 700 }}>
              {t("expense.reconcile.batch.pendingCount", { count: String(pendingExpenses.length) })}
            </span>
            {pendingExpenses.length > 0 && (
              <button type="button" className="btn-nav" onClick={toggleAll} disabled={submitting}>
                {t(allSelected ? "expense.reconcile.batch.clearAll" : "expense.reconcile.batch.selectAll")}
              </button>
            )}
          </div>

          <form onSubmit={submit} style={{
            display: "flex", flexDirection: "column", flex: "1 1 auto", minHeight: 0,
          }}>
            <div style={{
              display: "flex", flexDirection: "column", gap: "0.65rem",
              overflowY: "auto", flex: "1 1 auto", minHeight: 0,
              padding: "0.1rem 0.25rem 0.25rem 0",
            }}>
              {pendingExpenses.length === 0 ? (
                <div style={{
                  padding: "2rem 1rem", textAlign: "center", borderRadius: "12px",
                  background: "var(--bg-card-hover)", color: "var(--text-secondary)",
                }}>
                  {t("expense.reconcile.batch.empty")}
                </div>
              ) : pendingExpenses.map((expense) => {
                const isSelected = selectedSet.has(expense.id)
                const needsActualCharge = isForeignCardExpense(expense, baseCurrency)
                const invalid = isSelected && invalidSelectedIds.has(expense.id)
                const rowError = rowErrors[expense.id]

                return (
                  <div key={expense.id} style={{
                    padding: "0.8rem", borderRadius: "12px",
                    border: isSelected
                      ? "1px solid rgba(14, 165, 233, 0.55)"
                      : "1px solid var(--border-color)",
                    background: isSelected ? "rgba(14, 165, 233, 0.08)" : "var(--bg-card-hover)",
                  }}>
                    <div style={{
                      display: "flex", alignItems: "flex-start", justifyContent: "space-between",
                      gap: "0.75rem", flexWrap: "wrap",
                    }}>
                      <label style={{
                        display: "flex", alignItems: "flex-start", gap: "0.6rem",
                        cursor: submitting ? "default" : "pointer", flex: "1 1 240px",
                      }}>
                        <input
                          type="checkbox" checked={isSelected} disabled={submitting}
                          onChange={(event) => toggleSelected(expense.id, event.target.checked)}
                          style={{ width: 18, height: 18, marginTop: "0.15rem", accentColor: "var(--color-primary)" }}
                        />
                        <span style={{ minWidth: 0 }}>
                          <span style={{ display: "block", color: "var(--text-primary)", fontWeight: 750 }}>
                            {expense.item}
                          </span>
                          <span style={{ display: "block", marginTop: "0.18rem", color: "var(--text-secondary)", fontSize: "0.76rem" }}>
                            {format(new Date(expense.date), "yyyy/M/d")} · {expense.user.name}
                          </span>
                        </span>
                      </label>
                      <div style={{ textAlign: "right", flexShrink: 0 }}>
                        <div style={{ color: "var(--text-primary)", fontWeight: 800 }}>
                          {getCurrencySymbol(expense.currency)}{expense.amount.toLocaleString()}
                        </div>
                        {needsActualCharge && typeof expense.convertedAmount === "number" && (
                          <div style={{ color: "var(--text-secondary)", fontSize: "0.75rem", marginTop: "0.15rem" }}>
                            {t("expense.reconcile.batch.estimated")}{" "}
                            {getCurrencySymbol(baseCurrency)}{expense.convertedAmount.toLocaleString()}
                          </div>
                        )}
                      </div>
                    </div>

                    {needsActualCharge ? (
                      <label style={{
                        display: "flex", flexDirection: "column", gap: "0.3rem",
                        marginTop: "0.7rem", color: "var(--text-secondary)", fontSize: "0.8rem",
                      }}>
                        {t("expense.reconcile.actualCharge", { currency: baseCurrency })}
                        <input
                          type="number" min="0" step="any" inputMode="decimal"
                          className="input-field"
                          value={actualCharges[expense.id] ?? ""}
                          onChange={(event) => updateActualCharge(expense.id, event.target.value)}
                          disabled={submitting}
                          aria-invalid={invalid || Boolean(rowError)}
                          aria-label={t("expense.reconcile.batch.actualFor", {
                            item: expense.item,
                            date: format(new Date(expense.date), "yyyy/M/d"),
                            currency: baseCurrency,
                          })}
                          placeholder={typeof expense.convertedAmount !== "number"
                            ? getCurrencySymbol(baseCurrency)
                            : `${t("expense.reconcile.batch.estimated")} ${getCurrencySymbol(baseCurrency)}${expense.convertedAmount.toLocaleString()}`}
                          style={{ fontWeight: 750, textAlign: "right" }}
                        />
                        {invalid && !rowError && (
                          <span role="alert" style={{ color: "var(--color-warning-text)", fontSize: "0.74rem" }}>
                            {t("expense.reconcile.batch.actualRequired")}
                          </span>
                        )}
                      </label>
                    ) : (
                      <div style={{
                        display: "flex", alignItems: "center", gap: "0.4rem",
                        marginTop: "0.65rem", color: "var(--text-secondary)", fontSize: "0.76rem",
                      }}>
                        <CreditCard size={14} />
                        {t("expense.reconcile.batch.baseReady", { currency: baseCurrency })}
                      </div>
                    )}

                    {rowError && (
                      <div role="alert" style={{ color: "var(--color-danger)", fontSize: "0.75rem", marginTop: "0.45rem" }}>
                        {rowError}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            {resultMessage && (
              <div aria-live="polite" style={{ color: "var(--color-warning-text)", fontSize: "0.78rem", marginTop: "0.65rem" }}>
                {resultMessage}
              </div>
            )}

            <div style={{
              display: "flex", gap: "0.75rem", paddingTop: "0.85rem", marginTop: "0.35rem",
              borderTop: "1px solid var(--border-color)", flexShrink: 0,
            }}>
              <Dialog.Close asChild>
                <button type="button" className="btn-nav" disabled={submitting}>
                  {t("settings.delete.cancel")}
                </button>
              </Dialog.Close>
              <button
                type="submit" className="btn-primary"
                disabled={submitting || selectedExpenses.length === 0 || invalidSelectedIds.size > 0}
                style={{ flex: 1, justifyContent: "center" }}
              >
                {submitting ? (
                  <><Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} />{t("expense.reconcile.batch.saving")}</>
                ) : (
                  <><CheckCircle2 size={16} />{t("expense.reconcile.batch.save", { count: String(selectedExpenses.length) })}</>
                )}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
