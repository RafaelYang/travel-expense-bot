"use client"

import { useMemo, useState } from "react"
import { ArrowDownUp, Banknote, ChevronDown, ChevronUp, Loader2 } from "lucide-react"

import { useLanguage } from "@/components/language-provider"
import { ALL_CURRENCIES } from "@/lib/countries"
import { getCurrencySymbol } from "@/lib/utils"

export interface CashWalletData {
  id: string
  currency: string
  balance: number
  updatedAt: string
}

export interface CashExchangeData {
  id: string
  type: "buy" | "sell"
  foreignCurrency: string
  foreignAmount: number
  baseAmount: number
  exchangeRate: number
  date: string
  note?: string
  user: { id: string; name: string }
}

function localDateTimeValue() {
  const now = new Date()
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 16)
}

export function CashWalletPanel({
  tripId,
  baseCurrency,
  defaultForeignCurrency,
  wallets,
  exchanges,
  canEdit,
  onChanged,
}: {
  tripId: string
  baseCurrency: string
  defaultForeignCurrency: string
  wallets: CashWalletData[]
  exchanges: CashExchangeData[]
  canEdit: boolean
  onChanged: () => Promise<void> | void
}) {
  const { locale } = useLanguage()
  const zh = locale === "zh-TW"
  const availableWallets = wallets.filter((wallet) => wallet.balance > 0.000001)
  const fallbackCurrency = defaultForeignCurrency !== baseCurrency
    ? defaultForeignCurrency
    : Object.keys(ALL_CURRENCIES).find((currency) => currency !== baseCurrency) || "USD"
  const [expanded, setExpanded] = useState(wallets.length > 0)
  const [type, setType] = useState<"buy" | "sell">("buy")
  const [foreignCurrency, setForeignCurrency] = useState(availableWallets[0]?.currency || fallbackCurrency)
  const [foreignAmount, setForeignAmount] = useState("")
  const [baseAmount, setBaseAmount] = useState("")
  const [date, setDate] = useState(localDateTimeValue)
  const [note, setNote] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState("")

  const currencyOptions = useMemo(() => {
    if (type === "sell") return availableWallets.map((wallet) => wallet.currency)
    return Object.keys(ALL_CURRENCIES).filter((currency) => currency !== baseCurrency)
  }, [availableWallets, baseCurrency, type])

  const selectedWallet = wallets.find((wallet) => wallet.currency === foreignCurrency)
  const parsedForeign = Number(foreignAmount)
  const parsedBase = Number(baseAmount)
  const effectiveRate = parsedForeign > 0 && parsedBase > 0 ? parsedBase / parsedForeign : null

  const changeType = (nextType: "buy" | "sell") => {
    setType(nextType)
    setError("")
    if (nextType === "sell" && !availableWallets.some((wallet) => wallet.currency === foreignCurrency)) {
      setForeignCurrency(availableWallets[0]?.currency || fallbackCurrency)
    }
  }

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError("")
    setSubmitting(true)
    try {
      const response = await fetch(`/api/trips/${tripId}/cash-exchanges`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          foreignCurrency,
          foreignAmount: parsedForeign,
          baseAmount: parsedBase,
          date: new Date(date).toISOString(),
          note: note || undefined,
        }),
      })
      const data = await response.json().catch(() => null)
      if (!response.ok) {
        setError(data?.error || (zh ? "換匯失敗" : "Exchange failed"))
        return
      }

      setForeignAmount("")
      setBaseAmount("")
      setNote("")
      setDate(localDateTimeValue())
      await onChanged()
    } catch {
      setError(zh ? "換匯失敗，請稍後再試" : "Exchange failed. Please try again.")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <section className="glass-card" style={{ padding: "1rem 1.25rem", marginBottom: "1rem" }}>
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        style={{
          width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
          border: "none", background: "transparent", color: "var(--text-primary)", cursor: "pointer",
        }}
      >
        <span style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontWeight: 700 }}>
          <Banknote size={18} style={{ color: "#22c55e" }} />
          {zh ? "我的旅程現金" : "My trip cash"}
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: "var(--text-muted)", fontSize: "0.82rem" }}>
          {wallets.length === 0
            ? (zh ? "尚未換匯" : "No cash yet")
            : `${wallets.length} ${zh ? "種幣別" : "currencies"}`}
          {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </span>
      </button>

      {wallets.length > 0 && (
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginTop: "0.75rem" }}>
          {wallets.map((wallet) => (
            <span key={wallet.id} style={{
              padding: "0.35rem 0.65rem", borderRadius: "9999px",
              background: wallet.balance > 0 ? "rgba(34,197,94,0.12)" : "var(--bg-card-hover)",
              color: wallet.balance > 0 ? "#22c55e" : "var(--text-muted)",
              fontSize: "0.88rem", fontWeight: 700,
            }}>
              {wallet.currency} {getCurrencySymbol(wallet.currency)}{wallet.balance.toLocaleString()}
            </span>
          ))}
        </div>
      )}

      {expanded && (
        <div style={{ marginTop: "1rem", paddingTop: "1rem", borderTop: "1px solid var(--border-color)" }}>
          {canEdit && (
            <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem" }}>
                <button type="button" onClick={() => changeType("buy")} style={{
                  padding: "0.55rem", borderRadius: "8px", cursor: "pointer",
                  border: type === "buy" ? "1px solid #22c55e" : "1px solid var(--border-color)",
                  background: type === "buy" ? "rgba(34,197,94,0.12)" : "transparent",
                  color: type === "buy" ? "#22c55e" : "var(--text-secondary)", fontWeight: 700,
                }}>
                  {zh ? "換入外幣" : "Buy foreign cash"}
                </button>
                <button type="button" onClick={() => changeType("sell")} disabled={availableWallets.length === 0} style={{
                  padding: "0.55rem", borderRadius: "8px", cursor: availableWallets.length ? "pointer" : "not-allowed",
                  border: type === "sell" ? "1px solid #f59e0b" : "1px solid var(--border-color)",
                  background: type === "sell" ? "rgba(245,158,11,0.12)" : "transparent",
                  color: type === "sell" ? "#f59e0b" : "var(--text-secondary)", fontWeight: 700,
                  opacity: availableWallets.length ? 1 : 0.5,
                }}>
                  {zh ? "換回本國貨幣" : "Sell back"}
                </button>
              </div>

              <p style={{ margin: 0, fontSize: "0.82rem", lineHeight: 1.5, color: "var(--text-muted)" }}>
                {type === "buy"
                  ? (zh ? `換入時 ${baseCurrency} 會計入旅程支出；之後用現金記帳只扣餘額，不會重複增加花費。` : `Buying cash counts as ${baseCurrency} spending. Cash-paid expenses only reduce the wallet balance.`)
                  : (zh ? `換回收到的 ${baseCurrency} 會沖減旅程總花費。` : `The ${baseCurrency} received reduces net trip spending.`)}
              </p>

              <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: "0.5rem", alignItems: "center" }}>
                <label style={{ display: "flex", flexDirection: "column", gap: "0.25rem", fontSize: "0.82rem", color: "var(--text-muted)" }}>
                  {type === "buy" ? `${zh ? "付出" : "Paid"} (${baseCurrency})` : `${zh ? "收到" : "Received"} (${baseCurrency})`}
                  <input className="input-field" type="number" min="0" step="any" required value={baseAmount} onChange={(event) => setBaseAmount(event.target.value)} />
                </label>
                <ArrowDownUp size={18} style={{ color: "var(--color-primary)", marginTop: "1rem" }} />
                <label style={{ display: "flex", flexDirection: "column", gap: "0.25rem", fontSize: "0.82rem", color: "var(--text-muted)" }}>
                  {type === "buy" ? (zh ? "取得外幣" : "Foreign cash") : (zh ? "交回外幣" : "Foreign cash sold")}
                  <input className="input-field" type="number" min="0" step="any" required value={foreignAmount} onChange={(event) => setForeignAmount(event.target.value)} />
                </label>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem" }}>
                <select className="input-field" value={foreignCurrency} onChange={(event) => setForeignCurrency(event.target.value)} required>
                  {currencyOptions.map((currency) => (
                    <option key={currency} value={currency}>{ALL_CURRENCIES[currency]?.label || currency}</option>
                  ))}
                </select>
                <input className="input-field" type="datetime-local" value={date} onChange={(event) => setDate(event.target.value)} required />
              </div>

              {type === "sell" && selectedWallet && (
                <div style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
                  {zh ? "可換回餘額" : "Available"}: {selectedWallet.currency} {selectedWallet.balance.toLocaleString()}
                </div>
              )}
              {effectiveRate && (
                <div style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
                  1 {foreignCurrency} = {effectiveRate.toLocaleString(undefined, { maximumFractionDigits: 6 })} {baseCurrency}
                </div>
              )}

              <input className="input-field" value={note} onChange={(event) => setNote(event.target.value)} placeholder={zh ? "備註（例如機場換匯）" : "Note (e.g. airport exchange)"} />
              {error && <div role="alert" style={{ color: "var(--color-danger)", fontSize: "0.82rem" }}>{error}</div>}
              <button className="btn-primary" type="submit" disabled={submitting || currencyOptions.length === 0} style={{ justifyContent: "center" }}>
                {submitting ? <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} /> : (type === "buy" ? (zh ? "記錄換匯" : "Record exchange") : (zh ? "記錄換回" : "Record sell-back"))}
              </button>
            </form>
          )}

          {exchanges.length > 0 && (
            <div style={{ marginTop: "1rem" }}>
              <div style={{ fontSize: "0.85rem", fontWeight: 700, marginBottom: "0.5rem" }}>{zh ? "最近換匯" : "Recent exchanges"}</div>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                {exchanges.slice(0, 5).map((exchange) => (
                  <div key={exchange.id} style={{
                    display: "flex", justifyContent: "space-between", gap: "0.75rem",
                    padding: "0.55rem 0.65rem", borderRadius: "8px", background: "var(--bg-card-hover)", fontSize: "0.82rem",
                  }}>
                    <span>
                      {exchange.type === "buy" ? (zh ? "換入" : "Bought") : (zh ? "換回" : "Sold")}{" "}
                      {exchange.foreignCurrency} {exchange.foreignAmount.toLocaleString()}
                      <span style={{ color: "var(--text-muted)" }}> · {exchange.user.name}</span>
                    </span>
                    <span style={{ color: exchange.type === "buy" ? "var(--color-danger)" : "#22c55e", fontWeight: 700 }}>
                      {exchange.type === "buy" ? "−" : "+"}{getCurrencySymbol(baseCurrency)}{exchange.baseAmount.toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  )
}
