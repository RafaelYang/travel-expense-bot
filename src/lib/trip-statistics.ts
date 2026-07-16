import {
  getExpenseBaseAmount,
  type CashExchangeAmount,
  type ExpenseAmount,
} from "./money.ts"

export type StatisticsScope = "pretrip" | "trip" | "all"
export type DayKey = string

export interface StatisticsRange {
  startDay: DayKey
  endDay: DayKey
}

export interface StatisticsExpense extends ExpenseAmount {
  id: string
  category: string
  item: string
  occurredAt: string
  dayKey: DayKey
  paymentMethod: "card" | "cash"
}

export interface StatisticsExchange extends CashExchangeAmount {
  id: string
  occurredAt: string
  dayKey: DayKey
  type: "buy" | "sell"
}

export interface DailyFundFlowPoint {
  dayKey: DayKey
  directExpenseTotal: number
  exchangeBuyTotal: number
  exchangeSellTotal: number
  net: number
  directExpenseCount: number
  exchangeCount: number
  missingConversionCount: number
}

export interface CategoryExpenseDetail<E> {
  expense: E
  baseAmount: number | null
}

export interface CategoryConsumption<E> {
  category: string
  total: number
  count: number
  pricedCount: number
  missingConversionCount: number
  percentOfKnownTotal: number
  details: CategoryExpenseDetail<E>[]
}

const DAY_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/

export function getTripBoundaryDayKey(value: string) {
  const storedDay = value.match(/^(\d{4}-\d{2}-\d{2})/u)?.[1]
  if (!storedDay) {
    throw new Error("trip boundary must start with a YYYY-MM-DD calendar day")
  }
  return storedDay
}

function assertDayKey(dayKey: DayKey, label: string) {
  if (!DAY_KEY_PATTERN.test(dayKey)) {
    throw new Error(`${label} must be a YYYY-MM-DD calendar day`)
  }
}

function assertRange(range: StatisticsRange) {
  assertDayKey(range.startDay, "startDay")
  assertDayKey(range.endDay, "endDay")
  if (range.startDay > range.endDay) {
    throw new Error("startDay must be on or before endDay")
  }
}

function nextDayKey(dayKey: DayKey) {
  const [year, month, day] = dayKey.split("-").map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  date.setUTCDate(date.getUTCDate() + 1)
  return date.toISOString().slice(0, 10)
}

export function isDayInStatisticsScope(
  dayKey: DayKey,
  range: StatisticsRange,
  scope: StatisticsScope,
) {
  assertDayKey(dayKey, "dayKey")
  assertRange(range)

  if (scope === "pretrip") return dayKey < range.startDay
  if (scope === "trip") return dayKey >= range.startDay && dayKey <= range.endDay
  return true
}

function compareCategoryDetails<E extends StatisticsExpense>(
  a: CategoryExpenseDetail<E>,
  b: CategoryExpenseDetail<E>,
) {
  const timeDifference = Date.parse(b.expense.occurredAt) - Date.parse(a.expense.occurredAt)
  if (timeDifference !== 0) return timeDifference

  if (a.baseAmount === null && b.baseAmount !== null) return 1
  if (a.baseAmount !== null && b.baseAmount === null) return -1
  if (a.baseAmount !== null && b.baseAmount !== null && a.baseAmount !== b.baseAmount) {
    return b.baseAmount - a.baseAmount
  }

  return a.expense.id.localeCompare(b.expense.id)
}

export function buildTripStatistics<
  E extends StatisticsExpense,
  X extends StatisticsExchange,
>(input: {
  expenses: readonly E[]
  exchanges: readonly X[]
  baseCurrency: string
  range: StatisticsRange
  scope: StatisticsScope
  categoryOrder: readonly string[]
  fillTripDaysThrough?: DayKey
}) {
  const {
    expenses,
    exchanges,
    baseCurrency,
    range,
    scope,
    categoryOrder,
    fillTripDaysThrough,
  } = input
  assertRange(range)
  if (fillTripDaysThrough) assertDayKey(fillTripDaysThrough, "fillTripDaysThrough")

  const scopedExpenses = expenses.filter((expense) => (
    isDayInStatisticsScope(expense.dayKey, range, scope)
  ))
  const scopedExchanges = exchanges.filter((exchange) => (
    isDayInStatisticsScope(exchange.dayKey, range, scope)
  ))

  const dailyMap = new Map<DayKey, DailyFundFlowPoint>()
  const getDailyPoint = (dayKey: DayKey) => {
    const existing = dailyMap.get(dayKey)
    if (existing) return existing
    const created: DailyFundFlowPoint = {
      dayKey,
      directExpenseTotal: 0,
      exchangeBuyTotal: 0,
      exchangeSellTotal: 0,
      net: 0,
      directExpenseCount: 0,
      exchangeCount: 0,
      missingConversionCount: 0,
    }
    dailyMap.set(dayKey, created)
    return created
  }

  if (fillTripDaysThrough && scope !== "pretrip") {
    const lastDay = fillTripDaysThrough < range.endDay
      ? fillTripDaysThrough
      : range.endDay
    for (
      let dayKey = range.startDay;
      dayKey <= lastDay;
      dayKey = nextDayKey(dayKey)
    ) {
      getDailyPoint(dayKey)
    }
  }

  for (const expense of scopedExpenses) {
    if (expense.paymentMethod === "cash") continue

    const point = getDailyPoint(expense.dayKey)
    point.directExpenseCount += 1
    const amount = getExpenseBaseAmount(expense, baseCurrency)
    if (amount === null) {
      point.missingConversionCount += 1
      continue
    }
    point.directExpenseTotal += amount
    point.net += amount
  }

  for (const exchange of scopedExchanges) {
    const point = getDailyPoint(exchange.dayKey)
    point.exchangeCount += 1
    if (exchange.type === "sell") {
      point.exchangeSellTotal += exchange.baseAmount
      point.net -= exchange.baseAmount
    } else {
      point.exchangeBuyTotal += exchange.baseAmount
      point.net += exchange.baseAmount
    }
  }

  const dailyFundFlow = [...dailyMap.values()].sort((a, b) => (
    a.dayKey.localeCompare(b.dayKey)
  ))

  const fallbackCategory = categoryOrder.includes("other") ? "other" : undefined
  const categoryMap = new Map<string, {
    total: number
    count: number
    pricedCount: number
    missingConversionCount: number
    details: CategoryExpenseDetail<E>[]
  }>()

  for (const expense of scopedExpenses) {
    const category = categoryOrder.includes(expense.category)
      ? expense.category
      : (fallbackCategory ?? expense.category)
    const current = categoryMap.get(category) ?? {
      total: 0,
      count: 0,
      pricedCount: 0,
      missingConversionCount: 0,
      details: [],
    }
    const baseAmount = getExpenseBaseAmount(expense, baseCurrency)
    current.count += 1
    current.details.push({ expense, baseAmount })
    if (baseAmount === null) {
      current.missingConversionCount += 1
    } else {
      current.total += baseAmount
      current.pricedCount += 1
    }
    categoryMap.set(category, current)
  }

  const consumptionTotal = [...categoryMap.values()].reduce(
    (total, category) => total + category.total,
    0,
  )
  const categoryIndex = new Map(categoryOrder.map((category, index) => [category, index]))
  const categories: CategoryConsumption<E>[] = [...categoryMap.entries()]
    .map(([category, value]) => ({
      category,
      ...value,
      percentOfKnownTotal: consumptionTotal > 0 ? (value.total / consumptionTotal) * 100 : 0,
      details: [...value.details].sort(compareCategoryDetails),
    }))
    .sort((a, b) => (
      b.total - a.total
      || (categoryIndex.get(a.category) ?? Number.MAX_SAFE_INTEGER)
        - (categoryIndex.get(b.category) ?? Number.MAX_SAFE_INTEGER)
      || a.category.localeCompare(b.category)
    ))

  return {
    dailyFundFlow,
    categories,
    netFundFlowTotal: dailyFundFlow.reduce((total, point) => total + point.net, 0),
    consumptionTotal,
    fundFlowMissingConversionCount: dailyFundFlow.reduce(
      (total, point) => total + point.missingConversionCount,
      0,
    ),
    consumptionMissingConversionCount: categories.reduce(
      (total, category) => total + category.missingConversionCount,
      0,
    ),
  }
}
