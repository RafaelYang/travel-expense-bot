import assert from "node:assert/strict"
import test from "node:test"

import {
  summarizeDeposits,
  summarizeExpenses,
  summarizeTripSpending,
} from "../src/lib/money.ts"

test("expense totals never treat a missing foreign exchange rate as 1:1", () => {
  const result = summarizeExpenses([
    { amount: 100, currency: "TWD", convertedAmount: null },
    { amount: 1_000, currency: "JPY", convertedAmount: 220 },
    { amount: 10, currency: "USD", convertedAmount: null },
  ], "TWD")

  assert.deepEqual(result, { total: 320, missingConversionCount: 1 })
})

test("a reconciled foreign card expense uses its final settled amount", () => {
  const result = summarizeExpenses([{
    amount: 100,
    currency: "USD",
    convertedAmount: 3_100,
    settledAmount: 3_180,
    reconciledAt: "2026-07-16T00:00:00.000Z",
    paymentMethod: "card",
  }], "TWD")

  assert.deepEqual(result, { total: 3_180, missingConversionCount: 0 })
})

test("an unreconciled expense keeps using its estimate without deleting the settlement", () => {
  const result = summarizeExpenses([{
    amount: 100,
    currency: "USD",
    convertedAmount: 3_100,
    settledAmount: 3_180,
    reconciledAt: null,
    paymentMethod: "card",
  }], "TWD")

  assert.deepEqual(result, { total: 3_100, missingConversionCount: 0 })
})

test("cash expenses never use a stored card settlement", () => {
  const result = summarizeExpenses([{
    amount: 100,
    currency: "USD",
    convertedAmount: 3_100,
    settledAmount: 3_180,
    reconciledAt: "2026-07-16T00:00:00.000Z",
    paymentMethod: "cash",
  }], "TWD")

  assert.deepEqual(result, { total: 3_100, missingConversionCount: 0 })
})

test("service fees increase spending while ShopBack and card rewards reduce it", () => {
  const result = summarizeExpenses([{
    amount: 1_000,
    currency: "TWD",
    serviceFee: 15,
    shopbackReward: 30,
    creditCardReward: 20,
    paymentMethod: "card",
  }], "TWD")

  assert.deepEqual(result, { total: 965, missingConversionCount: 0 })
})

test("expense adjustments apply after a reconciled foreign-card charge", () => {
  const result = summarizeExpenses([{
    amount: 100,
    currency: "USD",
    convertedAmount: 3_100,
    settledAmount: 3_180,
    reconciledAt: "2026-07-16T00:00:00.000Z",
    paymentMethod: "card",
    serviceFee: 48,
    shopbackReward: 60,
    creditCardReward: 32,
  }], "TWD")

  assert.deepEqual(result, { total: 3_136, missingConversionCount: 0 })
})

test("invalid legacy adjustment values never corrupt totals", () => {
  const result = summarizeExpenses([{
    amount: 500,
    currency: "TWD",
    serviceFee: Number.NaN,
    shopbackReward: -20,
    creditCardReward: Number.POSITIVE_INFINITY,
  }], "TWD")

  assert.deepEqual(result, { total: 500, missingConversionCount: 0 })
})

test("deposit totals only include values already denominated in the base currency", () => {
  const result = summarizeDeposits([
    { amount: 500, currency: "TWD" },
    { amount: 100, currency: "JPY" },
  ], "TWD")

  assert.deepEqual(result, { total: 500, foreignCurrencyCount: 1 })
})

test("cash spending is recognized once at exchange time and sell-back reduces net spending", () => {
  const result = summarizeTripSpending([
    { amount: 300, currency: "TWD", convertedAmount: 300, paymentMethod: "card" },
    { amount: 1_000, currency: "JPY", convertedAmount: 220, paymentMethod: "cash" },
  ], [
    { type: "buy", baseAmount: 6_200 },
    { type: "sell", baseAmount: 1_100 },
  ], "TWD")

  assert.deepEqual(result, {
    total: 5_400,
    missingConversionCount: 0,
    exchangeNet: 5_100,
  })
})

test("missing conversion on a cash expense does not make the net total incomplete", () => {
  const result = summarizeTripSpending([
    { amount: 500, currency: "JPY", convertedAmount: null, paymentMethod: "cash" },
  ], [{ type: "buy", baseAmount: 1_000 }], "TWD")

  assert.equal(result.total, 1_000)
  assert.equal(result.missingConversionCount, 0)
})
