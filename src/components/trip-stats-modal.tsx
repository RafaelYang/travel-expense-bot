"use client"

import * as Dialog from "@radix-ui/react-dialog"
import { format } from "date-fns"
import { enUS, zhTW } from "date-fns/locale"
import {
  ArrowLeft,
  BarChart3,
  Banknote,
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  CreditCard,
  Info,
  Pencil,
  ReceiptText,
  X,
} from "lucide-react"
import Image from "next/image"
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react"

import { useLanguage } from "@/components/language-provider"
import {
  buildTripStatistics,
  getTripBoundaryDayKey,
  type StatisticsExpense,
  type StatisticsScope,
} from "@/lib/trip-statistics"
import { EXPENSE_CATEGORIES, getCategoryInfo, getCurrencySymbol } from "@/lib/utils"

import styles from "./trip-stats-modal.module.css"

export interface TripStatsExpense {
  id: string
  category: string
  item: string
  amount: number
  currency: string
  convertedAmount?: number
  exchangeRate?: number
  settledAmount?: number
  date: string
  createdAt: string
  note?: string
  images?: string[]
  source: string
  paymentMethod: "card" | "cash"
  reconciledAt?: string
  user: { id: string; name: string }
}

interface TripStatsExchange {
  id: string
  type: "buy" | "sell"
  baseAmount: number
  date: string
}

interface TripStatsModalTrip {
  startDate: string
  endDate: string
  baseCurrency: string
  budgetAmount?: number
  totalSpent: number
  totalDeposits: number
  missingConversionCount?: number
  foreignCurrencyDepositCount?: number
  expenses: TripStatsExpense[]
  cashExchanges: TripStatsExchange[]
  deposits: { id: string }[]
}

type StatsView =
  | { kind: "overview" }
  | { kind: "category"; category: string }
  | { kind: "expense"; category: string; expenseId: string }

type StatsTab = "daily" | "categories"
type PendingFocus =
  | { kind: "title" }
  | { kind: "category"; category: string }
  | { kind: "expense"; expenseId: string }

const CATEGORY_ORDER = EXPENSE_CATEGORIES.map((category) => category.value)

function calendarDayKey(value: string | Date) {
  return format(new Date(value), "yyyy-MM-dd")
}

function defaultStatisticsScope(startDate: string): StatisticsScope {
  return calendarDayKey(new Date()) < getTripBoundaryDayKey(startDate) ? "pretrip" : "trip"
}

function scopeTranslationKey(scope: StatisticsScope) {
  return `trip.stats.scope.${scope}`
}

function statsViewKey(view: StatsView) {
  if (view.kind === "overview") return "overview"
  if (view.kind === "category") return `category:${view.category}`
  return `expense:${view.expenseId}`
}

export function TripStatsModal({
  open,
  trip,
  canEdit,
  onOpenChange,
  onOpenBatchReconcile,
  onEditExpense,
}: {
  open: boolean
  trip: TripStatsModalTrip
  canEdit: boolean
  onOpenChange: (open: boolean) => void
  onOpenBatchReconcile: () => void
  onEditExpense: (expense: TripStatsExpense) => void
}) {
  const { locale, t } = useLanguage()
  const dateLocale = locale === "en" ? enUS : zhTW
  const titleRef = useRef<HTMLHeadingElement>(null)
  const scrollAreaRef = useRef<HTMLDivElement>(null)
  const chartScrollRef = useRef<HTMLDivElement>(null)
  const scrollPositionsRef = useRef(new Map<string, number>())
  const pendingScrollTopRef = useRef<number | null>(0)
  const pendingFocusRef = useRef<PendingFocus>({ kind: "title" })
  const categoryButtonRefs = useRef(new Map<string, HTMLButtonElement>())
  const expenseButtonRefs = useRef(new Map<string, HTMLButtonElement>())
  const dayBarRefs = useRef(new Map<string, HTMLButtonElement>())
  const modalHandoffRef = useRef(false)
  const [tab, setTab] = useState<StatsTab>("daily")
  const [scope, setScope] = useState<StatisticsScope>(() => defaultStatisticsScope(trip.startDate))
  const [view, setView] = useState<StatsView>({ kind: "overview" })
  const [selectedDayKey, setSelectedDayKey] = useState<string | null>(null)

  const statisticsExpenses = useMemo<(TripStatsExpense & StatisticsExpense)[]>(() => trip.expenses.map((expense) => ({
    ...expense,
    occurredAt: expense.date,
    dayKey: calendarDayKey(expense.date),
  })), [trip.expenses])
  const statisticsExchanges = useMemo(() => trip.cashExchanges.map((exchange) => ({
    ...exchange,
    occurredAt: exchange.date,
    dayKey: calendarDayKey(exchange.date),
  })), [trip.cashExchanges])
  const todayDayKey = calendarDayKey(new Date())
  const statistics = useMemo(() => buildTripStatistics({
    expenses: statisticsExpenses,
    exchanges: statisticsExchanges,
    baseCurrency: trip.baseCurrency,
    range: {
      startDay: getTripBoundaryDayKey(trip.startDate),
      endDay: getTripBoundaryDayKey(trip.endDate),
    },
    scope,
    categoryOrder: CATEGORY_ORDER,
    fillTripDaysThrough: todayDayKey,
  }), [
    scope,
    statisticsExchanges,
    statisticsExpenses,
    todayDayKey,
    trip.baseCurrency,
    trip.endDate,
    trip.startDate,
  ])

  const cardExpenses = trip.expenses.filter((expense) => expense.paymentMethod === "card")
  const pendingCardExpenses = cardExpenses.filter((expense) => !expense.reconciledAt)
  const confirmedCardExpenses = cardExpenses.length - pendingCardExpenses.length
  const hasPendingForeignCard = pendingCardExpenses.some((expense) => (
    expense.currency.toUpperCase() !== trip.baseCurrency.toUpperCase()
  ))
  const totalIsEstimated = hasPendingForeignCard || (trip.missingConversionCount ?? 0) > 0
  const foreignDepositCount = trip.foreignCurrencyDepositCount ?? 0
  const includedDepositCount = Math.max(0, trip.deposits.length - foreignDepositCount)
  const budgetAmount = trip.budgetAmount ?? 0
  const budgetPercent = budgetAmount > 0 ? (trip.totalSpent / budgetAmount) * 100 : 0
  const budgetRemaining = budgetAmount - trip.totalSpent
  const budgetColor = budgetPercent >= 95
    ? "var(--color-danger)"
    : budgetPercent >= 80
      ? "var(--color-warning)"
      : "var(--color-primary)"
  const selectedCategory = view.kind === "overview"
    ? null
    : statistics.categories.find((category) => category.category === view.category) ?? null
  const selectedExpenseDetail = view.kind === "expense"
    ? selectedCategory?.details.find((detail) => detail.expense.id === view.expenseId) ?? null
    : null
  const selectedExpense = selectedExpenseDetail?.expense as TripStatsExpense | undefined
  const selectionMissing = view.kind === "category"
    ? !selectedCategory
    : view.kind === "expense"
      ? !selectedCategory || !selectedExpenseDetail || !selectedExpense
      : false
  const latestActivityPoint = statistics.dailyFundFlow.findLast((point) => (
    point.directExpenseCount > 0 || point.exchangeCount > 0
  ))
  const selectedPoint = statistics.dailyFundFlow.find((point) => point.dayKey === selectedDayKey)
    ?? latestActivityPoint
    ?? statistics.dailyFundFlow.at(-1)
  const selectedPointDayKey = selectedPoint?.dayKey

  const maxPositive = Math.max(0, ...statistics.dailyFundFlow.map((point) => point.net))
  const maxNegative = Math.max(0, ...statistics.dailyFundFlow.map((point) => -point.net))
  const plotTop = 8
  const plotBottom = 174
  const plotRange = plotBottom - plotTop
  const absoluteRange = maxPositive + maxNegative
  const zeroY = absoluteRange > 0
    ? plotTop + (maxPositive / absoluteRange) * plotRange
    : plotBottom

  const money = (amount: number, currency = trip.baseCurrency) => (
    `${amount < 0 ? "−" : ""}${getCurrencySymbol(currency)}${Math.abs(amount).toLocaleString(locale, { maximumFractionDigits: 2 })}`
  )
  const compactMoney = (amount: number) => new Intl.NumberFormat(locale, {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(amount)
  const dayLabel = (dayKey: string) => format(
    new Date(`${dayKey}T12:00:00`),
    "M/d (EEE)",
    { locale: dateLocale },
  )
  const categoryLabel = (category: string) => t(
    `cat.${CATEGORY_ORDER.some((knownCategory) => knownCategory === category) ? category : "other"}`,
  )

  useEffect(() => {
    if (!open) return

    const scrollArea = scrollAreaRef.current
    if (scrollArea) {
      scrollArea.scrollTop = pendingScrollTopRef.current
        ?? scrollPositionsRef.current.get(statsViewKey(view))
        ?? 0
    }

    const focusTarget = pendingFocusRef.current
    if (focusTarget.kind === "category") {
      const target = categoryButtonRefs.current.get(focusTarget.category)
      if (target) target.focus()
      else titleRef.current?.focus()
    } else if (focusTarget.kind === "expense") {
      const target = expenseButtonRefs.current.get(focusTarget.expenseId)
      if (target) target.focus()
      else titleRef.current?.focus()
    } else {
      titleRef.current?.focus()
    }

    pendingScrollTopRef.current = null
    pendingFocusRef.current = { kind: "title" }
  }, [open, view])

  useEffect(() => {
    if (!open || view.kind !== "overview" || tab !== "daily" || !selectedPointDayKey) return
    const chartScroll = chartScrollRef.current
    const selectedBar = dayBarRefs.current.get(selectedPointDayKey)
    if (!chartScroll || !selectedBar) return

    const centeredLeft = selectedBar.offsetLeft
      - ((chartScroll.clientWidth - selectedBar.clientWidth) / 2)
    chartScroll.scrollLeft = Math.max(
      0,
      Math.min(centeredLeft, chartScroll.scrollWidth - chartScroll.clientWidth),
    )
  }, [open, selectedPointDayKey, tab, view.kind])

  const moveToView = (
    nextView: StatsView,
    options: { scrollTop?: number; focus?: PendingFocus } = {},
  ) => {
    if (scrollAreaRef.current) {
      scrollPositionsRef.current.set(statsViewKey(view), scrollAreaRef.current.scrollTop)
    }
    pendingScrollTopRef.current = options.scrollTop
      ?? scrollPositionsRef.current.get(statsViewKey(nextView))
      ?? 0
    pendingFocusRef.current = options.focus ?? { kind: "title" }
    setView(nextView)
  }

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      setView({ kind: "overview" })
      setSelectedDayKey(null)
      scrollPositionsRef.current.clear()
      pendingScrollTopRef.current = 0
      pendingFocusRef.current = { kind: "title" }
    }
    onOpenChange(nextOpen)
  }

  const goBack = () => {
    if (view.kind === "overview") return
    if (view.kind === "expense") {
      moveToView(
        { kind: "category", category: view.category },
        { focus: { kind: "expense", expenseId: view.expenseId } },
      )
      return
    }
    moveToView(
      { kind: "overview" },
      { focus: { kind: "category", category: view.category } },
    )
  }

  const dynamicTitle = view.kind === "overview"
    ? t("trip.stats.title")
    : view.kind === "category"
      ? t("trip.stats.categoryTitle", {
        category: categoryLabel(view.category),
        count: String(selectedCategory?.count ?? 0),
      })
      : t("trip.stats.detailTitle")

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className={styles.overlay} />
        <Dialog.Content
          className={`glass-card ${styles.modal}`}
          onOpenAutoFocus={(event) => {
            event.preventDefault()
            titleRef.current?.focus()
          }}
          onCloseAutoFocus={(event) => {
            if (modalHandoffRef.current) {
              event.preventDefault()
              modalHandoffRef.current = false
            }
          }}
        >
          <header className={styles.header}>
            <div className={styles.headerLeading}>
              {view.kind !== "overview" && (
                <button
                  type="button"
                  className={styles.iconButton}
                  onClick={goBack}
                  aria-label={view.kind === "expense"
                    ? t("trip.stats.backCategory", { category: categoryLabel(view.category) })
                    : t("trip.stats.backOverview")}
                >
                  <ArrowLeft size={20} aria-hidden="true" />
                </button>
              )}
              <Dialog.Title ref={titleRef} tabIndex={-1} className={styles.title}>
                {view.kind === "overview" && <BarChart3 size={21} aria-hidden="true" />}
                {dynamicTitle}
              </Dialog.Title>
            </div>
            <Dialog.Close asChild>
              <button
                type="button"
                className={styles.iconButton}
                aria-label={t("trip.stats.close")}
              >
                <X size={21} aria-hidden="true" />
              </button>
            </Dialog.Close>
          </header>

          <Dialog.Description className={styles.visuallyHidden}>
            {t("trip.stats.description")}
          </Dialog.Description>

          <div ref={scrollAreaRef} className={styles.scrollArea}>
            {view.kind === "overview" && (
              <>
                <section className={styles.heroCard} aria-labelledby="stats-total-label">
                  <div>
                    <p id="stats-total-label" className={styles.eyebrow}>
                      {t("trip.stats.currentTotal")}
                      {totalIsEstimated && <span className={styles.estimated}> {t("trip.stats.estimated")}</span>}
                    </p>
                    <p className={styles.heroAmount}>{money(trip.totalSpent)}</p>
                  </div>
                  <div className={styles.reconcileRow}>
                    <span>
                      <CheckCircle2 size={16} aria-hidden="true" />
                      {t("trip.stats.reconcileSummary", {
                        confirmed: String(confirmedCardExpenses),
                        pending: String(pendingCardExpenses.length),
                      })}
                    </span>
                    {canEdit && pendingCardExpenses.length > 0 && (
                      <button
                        type="button"
                        className={styles.secondaryButton}
                        onClick={() => {
                          modalHandoffRef.current = true
                          handleOpenChange(false)
                          onOpenBatchReconcile()
                        }}
                      >
                        {t("trip.stats.reconcileAction")}
                        <ChevronRight size={16} aria-hidden="true" />
                      </button>
                    )}
                  </div>
                </section>

                {budgetAmount > 0 && (
                  <section
                    className={`${styles.sectionCard} ${styles.budgetCard}`}
                    aria-label={t("budget.total")}
                    style={{ "--budget-color": budgetColor } as CSSProperties}
                  >
                    <div className={styles.budgetHeader}>
                      <span>{t("budget.total")}</span>
                      <strong>{budgetPercent.toLocaleString(locale, { maximumFractionDigits: 1 })}%</strong>
                    </div>
                    <div className={styles.budgetNumbers}>
                      <div>
                        <span>{t("budget.spent")}</span>
                        <strong>{money(trip.totalSpent)}</strong>
                      </div>
                      <div>
                        <span>{t("budget.remaining")}</span>
                        <strong className={budgetRemaining < 0 ? styles.dangerMoney : undefined}>
                          {money(budgetRemaining)}
                        </strong>
                      </div>
                    </div>
                    <div className={styles.budgetTrack} aria-hidden="true">
                      <span style={{ width: `${Math.min(Math.max(budgetPercent, 0), 100)}%` }} />
                    </div>
                    <div className={styles.budgetTotal}>
                      <span>{t("budget.total")} {money(budgetAmount)}</span>
                      <span>{t("budget.remaining")} {(100 - budgetPercent).toLocaleString(locale, { maximumFractionDigits: 1 })}%</span>
                    </div>
                  </section>
                )}

                <div
                  className={styles.segmented}
                  role="group"
                  aria-label={t("trip.stats.viewLabel")}
                >
                  <button
                    type="button"
                    className={tab === "daily" ? styles.segmentActive : undefined}
                    onClick={() => setTab("daily")}
                    aria-pressed={tab === "daily"}
                  >
                    <CircleDollarSign size={17} aria-hidden="true" />
                    {t("trip.stats.tab.daily")}
                  </button>
                  <button
                    type="button"
                    className={tab === "categories" ? styles.segmentActive : undefined}
                    onClick={() => setTab("categories")}
                    aria-pressed={tab === "categories"}
                  >
                    <ReceiptText size={17} aria-hidden="true" />
                    {t("trip.stats.tab.categories")}
                  </button>
                </div>

                <div
                  className={styles.scopeGroup}
                  role="group"
                  aria-label={t("trip.stats.scopeLabel")}
                >
                  {(["pretrip", "trip", "all"] as const).map((option) => (
                    <button
                      key={option}
                      type="button"
                      className={scope === option ? styles.scopeActive : undefined}
                      onClick={() => {
                        setScope(option)
                        setSelectedDayKey(null)
                      }}
                      aria-pressed={scope === option}
                    >
                      {t(scopeTranslationKey(option))}
                    </button>
                  ))}
                </div>

                {tab === "daily" ? (
                  <section className={styles.sectionCard} aria-labelledby="daily-fund-flow-title">
                    <div className={styles.sectionHeading}>
                      <div>
                        <h3 id="daily-fund-flow-title">{t("trip.stats.dailyTitle")}</h3>
                        <p>{t("trip.stats.dailyHelp")}</p>
                      </div>
                      <div className={styles.sectionMetric}>
                        <span>{t(scopeTranslationKey(scope))}</span>
                        <strong className={statistics.netFundFlowTotal < 0 ? styles.negativeMoney : undefined}>
                          {money(statistics.netFundFlowTotal)}
                          {statistics.fundFlowMissingConversionCount > 0 && t("trip.stats.estimated")}
                        </strong>
                        {statistics.fundFlowMissingConversionCount > 0 && (
                          <small className={styles.metricWarning}>
                            {t("trip.stats.scopeIncomplete", {
                              count: String(statistics.fundFlowMissingConversionCount),
                            })}
                          </small>
                        )}
                      </div>
                    </div>

                    {statistics.dailyFundFlow.length > 0 ? (
                      <>
                        <div className={styles.chartFrame}>
                          <div className={styles.axis} aria-hidden="true">
                            {maxPositive > 0 && (
                              <span style={{ top: `${plotTop - 2}px` }}>{compactMoney(maxPositive)}</span>
                            )}
                            <span style={{ top: `${Math.min(plotBottom - 18, Math.max(0, zeroY - 9))}px` }}>0</span>
                            {maxNegative > 0 && (
                              <span style={{ top: `${plotBottom - 10}px` }}>−{compactMoney(maxNegative)}</span>
                            )}
                          </div>
                          <div ref={chartScrollRef} className={styles.chartScroll}>
                            <div
                              className={styles.bars}
                              style={{ width: `${Math.max(360, statistics.dailyFundFlow.length * 64)}px` }}
                            >
                              <span
                                className={styles.zeroLine}
                                style={{ top: `${zeroY}px` }}
                                aria-hidden="true"
                              />
                              {statistics.dailyFundFlow.map((point) => {
                                const positiveSpace = Math.max(0, zeroY - plotTop)
                                const negativeSpace = Math.max(0, plotBottom - zeroY)
                                const barHeight = point.net > 0
                                  ? Math.max(3, (point.net / Math.max(maxPositive, 1)) * positiveSpace)
                                  : point.net < 0
                                    ? Math.max(3, (-point.net / Math.max(maxNegative, 1)) * negativeSpace)
                                    : 4
                                const barTop = point.net > 0 ? zeroY - barHeight : zeroY
                                const isSelected = selectedPoint?.dayKey === point.dayKey
                                return (
                                  <button
                                    key={point.dayKey}
                                    type="button"
                                    className={`${styles.barColumn} ${isSelected ? styles.barColumnSelected : ""}`}
                                    ref={(node) => {
                                      if (node) dayBarRefs.current.set(point.dayKey, node)
                                      else dayBarRefs.current.delete(point.dayKey)
                                    }}
                                    onClick={() => setSelectedDayKey(point.dayKey)}
                                    aria-pressed={isSelected}
                                    aria-label={t("trip.stats.dayAria", {
                                      date: dayLabel(point.dayKey),
                                      amount: money(point.net),
                                    })}
                                  >
                                    <span className={styles.barPlot} aria-hidden="true">
                                      <span
                                        className={`${styles.bar} ${point.net < 0 ? styles.barNegative : ""} ${point.net === 0 ? styles.barZero : ""}`}
                                        style={{ top: `${barTop}px`, height: `${barHeight}px` }}
                                      />
                                    </span>
                                    <span className={styles.barDate}>{dayLabel(point.dayKey)}</span>
                                  </button>
                                )
                              })}
                            </div>
                          </div>
                        </div>

                        {selectedPoint && (
                          <div className={styles.selectedDay} aria-live="polite">
                            <div>
                              <span>{dayLabel(selectedPoint.dayKey)}</span>
                              <strong className={selectedPoint.net < 0 ? styles.negativeMoney : undefined}>
                                {money(selectedPoint.net)}
                              </strong>
                            </div>
                            <dl>
                              <div>
                                <dt>{t("trip.stats.directExpense")}</dt>
                                <dd>{money(selectedPoint.directExpenseTotal)}</dd>
                              </div>
                              <div>
                                <dt>{t("trip.stats.exchangeBuy")}</dt>
                                <dd>{money(selectedPoint.exchangeBuyTotal)}</dd>
                              </div>
                              <div>
                                <dt>{t("trip.stats.exchangeSell")}</dt>
                                <dd>−{money(selectedPoint.exchangeSellTotal)}</dd>
                              </div>
                            </dl>
                            {selectedPoint.missingConversionCount > 0 && (
                              <p className={styles.warningText}>
                                {t("trip.stats.missingDaily", {
                                  count: String(selectedPoint.missingConversionCount),
                                })}
                              </p>
                            )}
                          </div>
                        )}
                      </>
                    ) : (
                      <div className={styles.emptyState}>
                        <BarChart3 size={28} aria-hidden="true" />
                        <p>{t("trip.stats.emptyDaily")}</p>
                      </div>
                    )}
                  </section>
                ) : (
                  <section className={styles.sectionCard} aria-labelledby="category-consumption-title">
                    <div className={styles.sectionHeading}>
                      <div>
                        <h3 id="category-consumption-title">{t("trip.stats.categoriesTitle")}</h3>
                        <p>{t("trip.stats.categoriesHelp")}</p>
                      </div>
                      <div className={styles.sectionMetric}>
                        <span>{t(scopeTranslationKey(scope))}</span>
                        <strong>
                          {money(statistics.consumptionTotal)}
                          {statistics.consumptionMissingConversionCount > 0 && t("trip.stats.estimated")}
                        </strong>
                        {statistics.consumptionMissingConversionCount > 0 && (
                          <small className={styles.metricWarning}>
                            {t("trip.stats.scopeIncomplete", {
                              count: String(statistics.consumptionMissingConversionCount),
                            })}
                          </small>
                        )}
                      </div>
                    </div>

                    {statistics.categories.length > 0 ? (
                      <ul className={styles.categoryList}>
                        {statistics.categories.map((category) => {
                          const info = getCategoryInfo(category.category)
                          return (
                            <li key={category.category}>
                              <button
                                type="button"
                                className={styles.categoryButton}
                                ref={(node) => {
                                  if (node) categoryButtonRefs.current.set(category.category, node)
                                  else categoryButtonRefs.current.delete(category.category)
                                }}
                                onClick={() => moveToView({
                                  kind: "category",
                                  category: category.category,
                                })}
                                aria-label={t("trip.stats.openCategory", {
                                  category: categoryLabel(category.category),
                                  amount: money(category.total),
                                  percent: category.percentOfKnownTotal.toFixed(1),
                                  count: String(category.count),
                                  conversionStatus: category.missingConversionCount > 0
                                    ? t("trip.stats.missingCategory", {
                                      count: String(category.missingConversionCount),
                                    })
                                    : t("trip.stats.allConverted"),
                                })}
                                style={{ "--category-color": info.color } as CSSProperties}
                              >
                                <span className={styles.categoryTopline}>
                                  <span className={styles.categoryName}>{categoryLabel(category.category)}</span>
                                  <strong>{money(category.total)}</strong>
                                  <ChevronRight size={18} aria-hidden="true" />
                                </span>
                                <span className={styles.categoryBottomline}>
                                  <span className={styles.progressTrack} aria-hidden="true">
                                    <span style={{ width: `${category.percentOfKnownTotal}%` }} />
                                  </span>
                                  <span>{category.percentOfKnownTotal.toFixed(1)}%</span>
                                  <span>{t("trip.allExpenses.count", { count: String(category.count) })}</span>
                                  {category.missingConversionCount > 0 && (
                                    <span className={styles.missingBadge}>
                                      {t("trip.stats.missingCategory", {
                                        count: String(category.missingConversionCount),
                                      })}
                                    </span>
                                  )}
                                </span>
                              </button>
                            </li>
                          )
                        })}
                      </ul>
                    ) : (
                      <div className={styles.emptyState}>
                        <ReceiptText size={28} aria-hidden="true" />
                        <p>{t("trip.stats.emptyCategories")}</p>
                      </div>
                    )}
                  </section>
                )}

                <section className={styles.fundSummary} aria-label={t("trip.stats.fundSummary")}>
                  <div>
                    <span>{t("trip.stats.deposited", { count: String(includedDepositCount) })}</span>
                    <strong>{money(trip.totalDeposits)}</strong>
                  </div>
                  {foreignDepositCount > 0 && (
                    <p className={styles.warningText}>
                      {t("trip.stats.depositIncomplete", { count: String(foreignDepositCount) })}
                    </p>
                  )}
                  <div className={styles.balanceRow}>
                    <span>{t("trip.stats.estimatedBalance")}</span>
                    <strong className={(trip.totalDeposits - trip.totalSpent) < 0 ? styles.dangerMoney : undefined}>
                      {money(trip.totalDeposits - trip.totalSpent)}
                    </strong>
                  </div>
                  <details className={styles.calculationDetails}>
                    <summary>
                      <Info size={16} aria-hidden="true" />
                      {t("trip.stats.calculation")}
                    </summary>
                    <p>{t("trip.stats.calculationFundFlow")}</p>
                    <p>{t("trip.stats.calculationCategories")}</p>
                    {((trip.missingConversionCount ?? 0) > 0 || (trip.foreignCurrencyDepositCount ?? 0) > 0) && (
                      <p className={styles.warningText}>
                        {t("trip.total.incomplete", {
                          expenses: String(trip.missingConversionCount ?? 0),
                          deposits: String(trip.foreignCurrencyDepositCount ?? 0),
                        })}
                      </p>
                    )}
                  </details>
                </section>
              </>
            )}

            {view.kind === "category" && selectedCategory && (
              <section>
                <div
                  className={styles.categorySummary}
                  style={{ "--category-color": getCategoryInfo(selectedCategory.category).color } as CSSProperties}
                >
                  <div>
                    <span>{categoryLabel(selectedCategory.category)}</span>
                    <strong>
                      {money(selectedCategory.total)}
                      {selectedCategory.missingConversionCount > 0 && t("trip.stats.estimated")}
                    </strong>
                  </div>
                  <p>
                    {t("trip.stats.categorySummary", {
                      percent: selectedCategory.percentOfKnownTotal.toFixed(1),
                      count: String(selectedCategory.count),
                      scope: t(scopeTranslationKey(scope)),
                    })}
                  </p>
                  {selectedCategory.missingConversionCount > 0 && (
                    <p className={styles.warningText}>
                      {t("trip.stats.scopeIncomplete", {
                        count: String(selectedCategory.missingConversionCount),
                      })}
                    </p>
                  )}
                </div>

                <ul className={styles.expenseList}>
                  {selectedCategory.details.map(({ expense, baseAmount }) => {
                    const formattedDate = format(
                      new Date(expense.date),
                      "yyyy/M/d (EEE)",
                      { locale: dateLocale },
                    )
                    const paymentLabel = expense.paymentMethod === "cash"
                      ? t("form.payment.cash")
                      : t("form.payment.card")
                    const statusLabel = expense.paymentMethod === "cash"
                      ? t("trip.stats.cashPaid")
                      : expense.reconciledAt
                        ? t("expense.reconcile.confirmed")
                        : t("expense.reconcile.pending")
                    const baseAmountLabel = baseAmount === null
                      ? t("trip.stats.pendingConversion")
                      : money(baseAmount)
                    const hasFinalCardAmount = expense.paymentMethod === "card"
                      && Boolean(expense.reconciledAt)
                      && typeof expense.settledAmount === "number"

                    return (
                      <li key={expense.id}>
                        <button
                          type="button"
                          className={styles.expenseButton}
                          ref={(node) => {
                            if (node) expenseButtonRefs.current.set(expense.id, node)
                            else expenseButtonRefs.current.delete(expense.id)
                          }}
                          onClick={() => moveToView({
                            kind: "expense",
                            category: selectedCategory.category,
                            expenseId: expense.id,
                          })}
                          aria-label={t("trip.stats.openExpense", {
                            item: expense.item,
                            date: formattedDate,
                            original: money(expense.amount, expense.currency),
                            payment: paymentLabel,
                            status: statusLabel,
                            amount: baseAmountLabel,
                          })}
                        >
                          <span className={styles.expenseMain}>
                            <span>
                              <strong>{expense.item}</strong>
                              <small>
                                <time dateTime={expense.date}>{formattedDate}</time>
                                {" · "}{expense.user.name}
                              </small>
                            </span>
                            <span className={styles.expenseAmounts}>
                              <strong>{money(expense.amount, expense.currency)}</strong>
                              {expense.currency !== trip.baseCurrency && (
                                <small>
                                  {baseAmount === null
                                    ? t("trip.stats.pendingConversion")
                                    : `${hasFinalCardAmount ? "✓" : "≈"} ${money(baseAmount)}`}
                                </small>
                              )}
                            </span>
                            <ChevronRight size={18} aria-hidden="true" />
                          </span>
                          <span className={styles.expenseBadges}>
                            <span className={expense.paymentMethod === "cash" ? styles.cashBadge : styles.cardBadge}>
                              {expense.paymentMethod === "cash"
                                ? <Banknote size={14} aria-hidden="true" />
                                : <CreditCard size={14} aria-hidden="true" />}
                              {paymentLabel}
                            </span>
                            {expense.paymentMethod === "card" && (
                              <span className={expense.reconciledAt ? styles.confirmedBadge : styles.pendingBadge}>
                                {expense.reconciledAt
                                  ? `✓ ${t("expense.reconcile.confirmed")}`
                                  : t("expense.reconcile.pending")}
                              </span>
                            )}
                            {expense.note && <span className={styles.notePreview}>{expense.note}</span>}
                          </span>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              </section>
            )}

            {view.kind === "expense" && selectedCategory && selectedExpense && selectedExpenseDetail && (
              <article className={styles.expenseDetail}>
                <span
                  className={styles.detailCategory}
                  style={{ "--category-color": getCategoryInfo(selectedCategory.category).color } as CSSProperties}
                >
                  {categoryLabel(selectedCategory.category)}
                </span>
                <h3>{selectedExpense.item}</h3>
                <p className={styles.detailAmount}>{money(selectedExpense.amount, selectedExpense.currency)}</p>

                {selectedExpense.currency !== trip.baseCurrency && selectedExpenseDetail.baseAmount !== null && (
                  <div className={styles.conversionCard}>
                    {selectedExpense.reconciledAt && selectedExpense.settledAmount
                      ? (
                        <>
                          <span>✓ {t("expense.reconcile.actualCharge", { currency: trip.baseCurrency })}</span>
                          <strong>{money(selectedExpense.settledAmount)}</strong>
                          <small>{t("expense.reconcile.finalRate", {
                            foreign: selectedExpense.currency,
                            base: trip.baseCurrency,
                            rate: (selectedExpense.settledAmount / selectedExpense.amount).toLocaleString(locale, {
                              maximumFractionDigits: 6,
                            }),
                          })}</small>
                        </>
                      )
                      : (
                        <>
                          <span>{t("trip.stats.estimatedConversion")}</span>
                          <strong>≈ {money(selectedExpenseDetail.baseAmount)}</strong>
                        </>
                      )}
                  </div>
                )}

                <dl className={styles.detailList}>
                  <div>
                    <dt>{t("expense.detail.recordedBy")}</dt>
                    <dd>{selectedExpense.user.name}</dd>
                  </div>
                  <div>
                    <dt>{t("expense.detail.time")}</dt>
                    <dd><time dateTime={selectedExpense.date}>{format(
                      new Date(selectedExpense.date),
                      "yyyy/M/d (EEE)",
                      { locale: dateLocale },
                    )}</time></dd>
                  </div>
                  <div>
                    <dt>{t("expense.detail.currency")}</dt>
                    <dd>{selectedExpense.currency}</dd>
                  </div>
                  <div>
                    <dt>{t("expense.detail.payment")}</dt>
                    <dd>{selectedExpense.paymentMethod === "cash" ? t("form.payment.cash") : t("form.payment.card")}</dd>
                  </div>
                  <div>
                    <dt>{t("expense.reconcile.status")}</dt>
                    <dd>{selectedExpense.paymentMethod === "cash"
                      ? t("trip.stats.cashPaid")
                      : selectedExpense.reconciledAt
                        ? t("expense.reconcile.confirmed")
                        : t("expense.reconcile.pending")}</dd>
                  </div>
                  {selectedExpense.note && (
                    <div>
                      <dt>{t("expense.detail.note")}</dt>
                      <dd>{selectedExpense.note}</dd>
                    </div>
                  )}
                  <div>
                    <dt>{t("expense.detail.source")}</dt>
                    <dd>{selectedExpense.source === "line"
                      ? t("expense.detail.source.line")
                      : t("expense.detail.source.web")}</dd>
                  </div>
                </dl>

                {selectedExpense.images && selectedExpense.images.length > 0 && (
                  <section className={styles.receipts} aria-labelledby="stats-receipts-title">
                    <h4 id="stats-receipts-title">
                      {t("trip.stats.receipts", { count: String(selectedExpense.images.length) })}
                    </h4>
                    {selectedExpense.images.map((src, index) => (
                      <Image
                        key={src}
                        src={src}
                        alt={t("trip.stats.receiptAlt", { index: String(index + 1) })}
                        width={900}
                        height={600}
                        unoptimized
                        className={styles.receiptImage}
                      />
                    ))}
                  </section>
                )}

                {canEdit && (
                  <button
                    type="button"
                    className={styles.primaryButton}
                    onClick={() => {
                      modalHandoffRef.current = true
                      handleOpenChange(false)
                      onEditExpense(selectedExpense)
                    }}
                  >
                    <Pencil size={17} aria-hidden="true" />
                    {t("trip.stats.editExpense")}
                  </button>
                )}
              </article>
            )}

            {selectionMissing && (
              <div className={styles.emptyState}>
                <p>{t("trip.stats.selectionMissing")}</p>
                <button
                  type="button"
                  className={styles.secondaryButton}
                  onClick={() => moveToView({ kind: "overview" })}
                >
                  {t("trip.stats.backOverview")}
                </button>
              </div>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
