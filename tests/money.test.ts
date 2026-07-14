import assert from "node:assert/strict"
import test from "node:test"

import { summarizeDeposits, summarizeExpenses } from "../src/lib/money.ts"

test("expense totals never treat a missing foreign exchange rate as 1:1", () => {
  const result = summarizeExpenses([
    { amount: 100, currency: "TWD", convertedAmount: null },
    { amount: 1_000, currency: "JPY", convertedAmount: 220 },
    { amount: 10, currency: "USD", convertedAmount: null },
  ], "TWD")

  assert.deepEqual(result, { total: 320, missingConversionCount: 1 })
})

test("deposit totals only include values already denominated in the base currency", () => {
  const result = summarizeDeposits([
    { amount: 500, currency: "TWD" },
    { amount: 100, currency: "JPY" },
  ], "TWD")

  assert.deepEqual(result, { total: 500, foreignCurrencyCount: 1 })
})
