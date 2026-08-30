"use client"

import { format } from "date-fns"
import { enUS, zhTW } from "date-fns/locale"
import {
  ArrowLeft,
  ArrowRightLeft,
  CheckCircle2,
  CircleDollarSign,
  ClipboardCheck,
  ListChecks,
  ReceiptText,
  UserRound,
} from "lucide-react"
import Link from "next/link"
import dynamic from "next/dynamic"
import { useRouter } from "next/navigation"
import { useMemo, useState } from "react"

import { useLanguage } from "@/components/language-provider"
import { Navbar } from "@/components/navbar"
import { getExpenseBaseAmount } from "@/lib/money"
import { getCurrencySymbol } from "@/lib/utils"

import styles from "./records-client.module.css"

const BatchReconcileModal = dynamic(
  () => import("@/components/batch-reconcile-modal").then((module) => module.BatchReconcileModal),
)

export interface RecordsTripData {
  id: string
  name: string
  baseCurrency: string
  expenseAdjustmentsEnabled: boolean
  userRole: string
  expenses: {
    id: string
    item: string
    amount: number
    currency: string
    convertedAmount?: number
    settledAmount?: number
    serviceFee: number
    shopbackReward: number
    creditCardReward: number
    date: string
    createdAt: string
    paymentMethod: "card" | "cash"
    reconciledAt?: string
    user: { name: string }
  }[]
  deposits: {
    id: string
    amount: number
    currency: string
    note?: string
    date: string
    createdAt: string
    user: { name: string }
  }[]
  cashExchanges: {
    id: string
    type: "buy" | "sell"
    foreignCurrency: string
    foreignAmount: number
    baseAmount: number
    date: string
    createdAt: string
    user: { name: string }
  }[]
}

type RecordsFilter = "all" | "pending" | "confirmed" | "not-required"
type RecordStatus = "pending" | "confirmed" | "not-required"

interface RecordsItem {
  id: string
  kind: "expense" | "deposit" | "exchange"
  item: string
  amountLabel: string
  netAmountLabel?: string
  date: string
  createdAt: string
  recorder: string
  status: RecordStatus
}

export default function RecordsClient({ initialTrip }: { initialTrip: RecordsTripData }) {
  const { locale, t } = useLanguage()
  const router = useRouter()
  const [filter, setFilter] = useState<RecordsFilter>("all")
  const [batchOpen, setBatchOpen] = useState(false)
  const dateLocale = locale === "zh-TW" ? zhTW : enUS
  const canEdit = initialTrip.userRole !== "viewer"

  const records = useMemo<RecordsItem[]>(() => {
    const expenses: RecordsItem[] = initialTrip.expenses.map((expense) => {
      const hasAdjustments = expense.serviceFee > 0
        || expense.shopbackReward > 0
        || expense.creditCardReward > 0
      const netAmount = hasAdjustments
        ? getExpenseBaseAmount(expense, initialTrip.baseCurrency)
        : null
      return {
        id: expense.id,
        kind: "expense",
        item: expense.item,
        amountLabel: `${getCurrencySymbol(expense.currency)}${expense.amount.toLocaleString()}`,
        netAmountLabel: netAmount === null
          ? undefined
          : t("trip.records.netAmount", {
            currency: initialTrip.baseCurrency,
            amount: netAmount.toLocaleString(locale, { maximumFractionDigits: 2 }),
          }),
        date: expense.date,
        createdAt: expense.createdAt,
        recorder: expense.user.name,
        status: expense.reconciledAt ? "confirmed" : "pending",
      }
    })
    const deposits: RecordsItem[] = initialTrip.deposits.map((deposit) => ({
      id: deposit.id,
      kind: "deposit",
      item: deposit.note || t("form.tab.income"),
      amountLabel: `+${getCurrencySymbol(deposit.currency)}${deposit.amount.toLocaleString()}`,
      date: deposit.date,
      createdAt: deposit.createdAt,
      recorder: deposit.user.name,
      status: "not-required",
    }))
    const exchanges: RecordsItem[] = initialTrip.cashExchanges.map((exchange) => ({
      id: exchange.id,
      kind: "exchange",
      item: `${t(exchange.type === "buy" ? "trip.exchange.buy" : "trip.exchange.sell")} ${exchange.foreignCurrency} ${getCurrencySymbol(exchange.foreignCurrency)}${exchange.foreignAmount.toLocaleString()}`,
      amountLabel: `${exchange.type === "buy" ? "+" : "−"}${getCurrencySymbol(initialTrip.baseCurrency)}${exchange.baseAmount.toLocaleString()}`,
      date: exchange.date,
      createdAt: exchange.createdAt,
      recorder: exchange.user.name,
      status: "not-required",
    }))

    return [...expenses, ...deposits, ...exchanges].sort((left, right) => {
      const dateDifference = new Date(right.date).getTime() - new Date(left.date).getTime()
      if (dateDifference !== 0) return dateDifference
      return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()
    })
  }, [initialTrip, locale, t])

  const filteredRecords = filter === "all"
    ? records
    : records.filter((record) => record.status === filter)
  const pendingCount = initialTrip.expenses.filter((expense) => !expense.reconciledAt).length
  const confirmedCount = initialTrip.expenses.length - pendingCount
  const recorderCount = new Set(records.map((record) => record.recorder).filter(Boolean)).size
  const pendingCardExpenses = initialTrip.expenses.filter(
    (expense) => expense.paymentMethod === "card" && !expense.reconciledAt,
  )

  const statusLabel = (status: RecordStatus) => t(`trip.records.status.${status}`)
  const kindIcon = (kind: RecordsItem["kind"]) => {
    if (kind === "deposit") return <CircleDollarSign size={20} aria-hidden="true" />
    if (kind === "exchange") return <ArrowRightLeft size={20} aria-hidden="true" />
    return <ReceiptText size={20} aria-hidden="true" />
  }

  return (
    <div className={styles.page}>
      <Navbar />
      <main className={styles.main}>
        <Link href={`/trips/${initialTrip.id}`} className="btn-nav">
          <ArrowLeft size={16} aria-hidden="true" />
          {t("trip.records.back")}
        </Link>

        <section className={`glass-card ${styles.hero}`}>
          <div className={styles.heroTitle}>
            <span className={styles.heroIcon}><ClipboardCheck size={24} aria-hidden="true" /></span>
            <div>
              <p>{initialTrip.name}</p>
              <h1>{t("trip.records.title")}</h1>
            </div>
          </div>
          <p className={styles.description}>{t("trip.records.description")}</p>
          <div className={styles.summaryGrid}>
            <div><strong>{pendingCount}</strong><span>{t("trip.records.summary.pending")}</span></div>
            <div><strong>{confirmedCount}</strong><span>{t("trip.records.summary.confirmed")}</span></div>
            <div><strong>{recorderCount}</strong><span>{t("trip.records.summary.recorders")}</span></div>
          </div>
        </section>

        <section className={`glass-card ${styles.recordsCard}`}>
          <header className={styles.recordsHeader}>
            <div>
              <h2>{t("trip.records.listTitle", { count: String(records.length) })}</h2>
              <p>{t("trip.records.listDescription")}</p>
            </div>
            {canEdit && pendingCardExpenses.length > 0 && (
              <button type="button" className="btn-primary" onClick={() => setBatchOpen(true)}>
                <ListChecks size={17} aria-hidden="true" />
                {t("expense.reconcile.batch.open", { count: String(pendingCardExpenses.length) })}
              </button>
            )}
          </header>

          <div className={styles.filters} role="group" aria-label={t("trip.records.filterLabel")}>
            {(["all", "pending", "confirmed", "not-required"] as const).map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={filter === value}
                onClick={() => setFilter(value)}
              >
                {t(`trip.records.filter.${value}`)}
              </button>
            ))}
          </div>

          <div className={styles.recordList}>
            {filteredRecords.length === 0 ? (
              <div className={styles.empty}>{t("trip.records.empty")}</div>
            ) : filteredRecords.map((record) => (
              <article key={`${record.kind}:${record.id}`} className={styles.recordRow}>
                <span className={`${styles.kindIcon} ${styles[record.kind]}`}>{kindIcon(record.kind)}</span>
                <div className={styles.recordContent}>
                  <h3>{record.item}</h3>
                  <div className={styles.recordMeta}>
                    <span>{format(new Date(record.date), "yyyy/M/d (EEE)", { locale: dateLocale })}</span>
                    <span><UserRound size={14} aria-hidden="true" />{t("trip.records.recorder", { name: record.recorder || "—" })}</span>
                  </div>
                </div>
                <div className={styles.amountStatus}>
                  <strong>{record.amountLabel}</strong>
                  {record.netAmountLabel && <small className={styles.netAmount}>{record.netAmountLabel}</small>}
                  <span className={`${styles.status} ${styles[record.status]}`}>
                    {record.status === "confirmed" && <CheckCircle2 size={14} aria-hidden="true" />}
                    {statusLabel(record.status)}
                  </span>
                </div>
              </article>
            ))}
          </div>
        </section>
      </main>

      {batchOpen && (
        <BatchReconcileModal
          tripId={initialTrip.id}
          baseCurrency={initialTrip.baseCurrency}
          expenseAdjustmentsEnabled={initialTrip.expenseAdjustmentsEnabled}
          expenses={pendingCardExpenses}
          onClose={() => setBatchOpen(false)}
          onSaved={async () => { router.refresh() }}
        />
      )}
    </div>
  )
}
