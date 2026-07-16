import assert from "node:assert/strict"
import test from "node:test"

import {
  buildTripStatistics,
  getTripBoundaryDayKey,
  isDayInStatisticsScope,
  type StatisticsExchange,
  type StatisticsExpense,
} from "../src/lib/trip-statistics.ts"
import { summarizeExpenses, summarizeTripSpending } from "../src/lib/money.ts"

const range = { startDay: "2026-07-17", endDay: "2026-07-28" }
const categories = ["food", "transport", "accommodation", "shopping", "ticket", "other"]

function expense(
  overrides: Partial<StatisticsExpense> & Pick<StatisticsExpense, "id" | "dayKey">,
): StatisticsExpense {
  return {
    category: "food",
    item: overrides.id,
    amount: 100,
    currency: "TWD",
    occurredAt: `${overrides.dayKey}T12:00:00.000Z`,
    paymentMethod: "card",
    ...overrides,
  }
}

function exchange(
  overrides: Partial<StatisticsExchange> & Pick<StatisticsExchange, "id" | "dayKey" | "type">,
): StatisticsExchange {
  return {
    baseAmount: 1_000,
    occurredAt: `${overrides.dayKey}T12:00:00.000Z`,
    ...overrides,
  }
}

test("calendar-day scope includes both trip boundary days", () => {
  assert.equal(isDayInStatisticsScope("2026-07-16", range, "pretrip"), true)
  assert.equal(isDayInStatisticsScope("2026-07-16", range, "trip"), false)
  assert.equal(isDayInStatisticsScope("2026-07-17", range, "trip"), true)
  assert.equal(isDayInStatisticsScope("2026-07-28", range, "trip"), true)
  assert.equal(isDayInStatisticsScope("2026-07-29", range, "trip"), false)
  assert.equal(isDayInStatisticsScope("2026-07-29", range, "all"), true)
})

test("trip boundary dates preserve their stored calendar day across time zones", () => {
  assert.equal(getTripBoundaryDayKey("2026-07-17T00:00:00.000Z"), "2026-07-17")
  assert.equal(getTripBoundaryDayKey("2026-07-28"), "2026-07-28")
  assert.throws(() => getTripBoundaryDayKey("July 17, 2026"), /YYYY-MM-DD/)
})

test("daily fund flow counts card spending and exchanges without double-counting cash", () => {
  const result = buildTripStatistics({
    expenses: [
      expense({ id: "base-card", dayKey: "2026-07-18", amount: 300 }),
      expense({
        id: "foreign-estimate",
        dayKey: "2026-07-18",
        amount: 10,
        currency: "EUR",
        convertedAmount: 350.5,
      }),
      expense({
        id: "foreign-final",
        dayKey: "2026-07-18",
        amount: 20,
        currency: "EUR",
        convertedAmount: 700,
        settledAmount: 735.25,
        reconciledAt: "2026-07-20T00:00:00.000Z",
      }),
      expense({
        id: "cash",
        dayKey: "2026-07-18",
        paymentMethod: "cash",
        currency: "EUR",
        convertedAmount: 1_100,
      }),
      expense({
        id: "missing",
        dayKey: "2026-07-18",
        currency: "USD",
        convertedAmount: null,
      }),
    ],
    exchanges: [
      exchange({ id: "buy", dayKey: "2026-07-18", type: "buy", baseAmount: 5_000 }),
      exchange({ id: "sell", dayKey: "2026-07-18", type: "sell", baseAmount: 900 }),
    ],
    baseCurrency: "TWD",
    range,
    scope: "trip",
    categoryOrder: categories,
  })

  assert.equal(result.dailyFundFlow.length, 1)
  assert.deepEqual(result.dailyFundFlow[0], {
    dayKey: "2026-07-18",
    directExpenseTotal: 1_385.75,
    exchangeBuyTotal: 5_000,
    exchangeSellTotal: 900,
    net: 5_485.75,
    directExpenseCount: 4,
    exchangeCount: 2,
    missingConversionCount: 1,
  })
  assert.equal(result.netFundFlowTotal, 5_485.75)
  assert.equal(result.fundFlowMissingConversionCount, 1)
})

test("the selected date scope applies to both fund flow and consumption", () => {
  const result = buildTripStatistics({
    expenses: [
      expense({ id: "before", dayKey: "2026-07-16", amount: 100 }),
      expense({ id: "during", dayKey: "2026-07-17", amount: 200 }),
      expense({ id: "after", dayKey: "2026-07-29", amount: 300 }),
    ],
    exchanges: [
      exchange({ id: "before-exchange", dayKey: "2026-07-16", type: "buy", baseAmount: 400 }),
      exchange({ id: "during-exchange", dayKey: "2026-07-17", type: "sell", baseAmount: 50 }),
    ],
    baseCurrency: "TWD",
    range,
    scope: "pretrip",
    categoryOrder: categories,
  })

  assert.equal(result.netFundFlowTotal, 500)
  assert.equal(result.consumptionTotal, 100)
  assert.deepEqual(result.dailyFundFlow.map((point) => point.dayKey), ["2026-07-16"])
  assert.deepEqual(result.categories[0].details.map((detail) => detail.expense.id), ["before"])
})

test("trip charts fill elapsed zero-flow days without padding future dates", () => {
  const result = buildTripStatistics({
    expenses: [
      expense({ id: "first-day", dayKey: "2026-07-17", amount: 200 }),
      expense({
        id: "cash-only-day",
        dayKey: "2026-07-18",
        paymentMethod: "cash",
        currency: "EUR",
        convertedAmount: 350,
      }),
    ],
    exchanges: [],
    baseCurrency: "TWD",
    range: { startDay: "2026-07-17", endDay: "2026-07-22" },
    scope: "trip",
    categoryOrder: categories,
    fillTripDaysThrough: "2026-07-20",
  })

  assert.deepEqual(
    result.dailyFundFlow.map((point) => ({ dayKey: point.dayKey, net: point.net })),
    [
      { dayKey: "2026-07-17", net: 200 },
      { dayKey: "2026-07-18", net: 0 },
      { dayKey: "2026-07-19", net: 0 },
      { dayKey: "2026-07-20", net: 0 },
    ],
  )
})

test("selling back more cash than the day's direct spend produces a negative bar", () => {
  const result = buildTripStatistics({
    expenses: [expense({ id: "small-card", dayKey: "2026-07-20", amount: 250.25 })],
    exchanges: [exchange({
      id: "large-sell",
      dayKey: "2026-07-20",
      type: "sell",
      baseAmount: 1_000.5,
    })],
    baseCurrency: "TWD",
    range,
    scope: "trip",
    categoryOrder: categories,
  })

  assert.equal(result.dailyFundFlow[0].net, -750.25)
  assert.equal(result.netFundFlowTotal, -750.25)
})

test("category consumption includes cash, keeps missing conversions, and groups unknown categories as other", () => {
  const result = buildTripStatistics({
    expenses: [
      expense({ id: "card", dayKey: "2026-07-18", category: "transport", amount: 600 }),
      expense({
        id: "cash",
        dayKey: "2026-07-18",
        category: "transport",
        paymentMethod: "cash",
        currency: "EUR",
        convertedAmount: 400,
      }),
      expense({
        id: "unknown",
        dayKey: "2026-07-19",
        category: "unexpected",
        currency: "USD",
        convertedAmount: null,
      }),
    ],
    exchanges: [],
    baseCurrency: "TWD",
    range,
    scope: "trip",
    categoryOrder: categories,
  })

  assert.equal(result.consumptionTotal, 1_000)
  assert.equal(result.categories[0].category, "transport")
  assert.equal(result.categories[0].count, 2)
  assert.equal(result.categories[0].percentOfKnownTotal, 100)
  assert.equal(result.categories[1].category, "other")
  assert.equal(result.categories[1].count, 1)
  assert.equal(result.categories[1].pricedCount, 0)
  assert.equal(result.categories[1].missingConversionCount, 1)
  assert.equal(result.categories[1].percentOfKnownTotal, 0)
})

test("category details have a stable newest-first ordering", () => {
  const firstInput = [
    expense({ id: "c", dayKey: "2026-07-19", amount: 100, occurredAt: "2026-07-19T10:00:00.000Z" }),
    expense({ id: "b", dayKey: "2026-07-19", amount: 300, occurredAt: "2026-07-19T10:00:00.000Z" }),
    expense({
      id: "d",
      dayKey: "2026-07-19",
      currency: "USD",
      convertedAmount: null,
      occurredAt: "2026-07-19T10:00:00.000Z",
    }),
    expense({ id: "a", dayKey: "2026-07-18", amount: 900 }),
  ]
  const build = (expenses: StatisticsExpense[]) => buildTripStatistics({
    expenses,
    exchanges: [],
    baseCurrency: "TWD",
    range,
    scope: "trip",
    categoryOrder: categories,
  }).categories[0].details.map((detail) => detail.expense.id)

  assert.deepEqual(build(firstInput), ["b", "c", "d", "a"])
  assert.deepEqual(build([...firstInput].reverse()), ["b", "c", "d", "a"])
})

test("all-date chart and category totals stay aligned with the canonical money summaries", () => {
  const expenses = [
    expense({ id: "before-card", dayKey: "2026-07-16", amount: 200 }),
    expense({
      id: "trip-cash",
      dayKey: "2026-07-18",
      paymentMethod: "cash",
      currency: "EUR",
      convertedAmount: 450,
    }),
    expense({
      id: "after-final-card",
      dayKey: "2026-07-29",
      currency: "EUR",
      convertedAmount: 700,
      settledAmount: 730,
      reconciledAt: "2026-07-30T00:00:00.000Z",
    }),
    expense({
      id: "missing-card",
      dayKey: "2026-07-30",
      currency: "USD",
      convertedAmount: null,
    }),
  ]
  const exchanges = [
    exchange({ id: "buy", dayKey: "2026-07-15", type: "buy", baseAmount: 5_000 }),
    exchange({ id: "sell", dayKey: "2026-07-31", type: "sell", baseAmount: 800 }),
  ]
  const result = buildTripStatistics({
    expenses,
    exchanges,
    baseCurrency: "TWD",
    range,
    scope: "all",
    categoryOrder: categories,
  })

  assert.equal(
    result.dailyFundFlow.reduce((total, point) => total + point.net, 0),
    summarizeTripSpending(expenses, exchanges, "TWD").total,
  )
  assert.equal(
    result.categories.reduce((total, category) => total + category.total, 0),
    summarizeExpenses(expenses, "TWD").total,
  )
})

test("invalid statistics ranges fail instead of silently dropping data", () => {
  assert.throws(() => buildTripStatistics({
    expenses: [],
    exchanges: [],
    baseCurrency: "TWD",
    range: { startDay: "2026-07-28", endDay: "2026-07-17" },
    scope: "all",
    categoryOrder: categories,
  }), /startDay/)
})
