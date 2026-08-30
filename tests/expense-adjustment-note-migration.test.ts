import assert from "node:assert/strict"
import test from "node:test"

import {
  buildExpenseAdjustmentNoteMigration,
  parseExpenseAdjustmentNote,
} from "../scripts/lib/expense-adjustment-note.mjs"

test("legacy service-fee notes move the fee and preserve other note text", () => {
  assert.deepEqual(parseExpenseAdjustmentNote("國外交易服務費 $19"), {
    serviceFee: 19,
    note: null,
  })
  assert.deepEqual(parseExpenseAdjustmentNote("COMME/國外交易服務費 $30"), {
    serviceFee: 30,
    note: "COMME",
  })
  assert.deepEqual(parseExpenseAdjustmentNote("尺寸L寄放兩小時/國外交易手續費 NT$5"), {
    serviceFee: 5,
    note: "尺寸L寄放兩小時",
  })
})

test("unstructured or duplicate fee text is rejected instead of guessed", () => {
  assert.equal(parseExpenseAdjustmentNote("服務費大約 $20"), null)
  assert.equal(parseExpenseAdjustmentNote("國外交易服務費 $5/國外交易手續費 $5"), null)
  assert.equal(parseExpenseAdjustmentNote("一般備註"), null)
})

test("base-currency migration separates the fee without changing net spending", () => {
  const migration = buildExpenseAdjustmentNoteMigration({
    id: "base",
    baseCurrency: "TWD",
    currency: "TWD",
    paymentMethod: "card",
    amount: 1_318,
    convertedAmount: 1_318,
    settledAmount: null,
    reconciledAt: new Date(),
    note: "國外交易服務費 $19",
    serviceFee: 0,
    shopbackReward: 0,
    creditCardReward: 0,
  })

  assert.deepEqual(migration.after, {
    amount: 1_299,
    convertedAmount: 1_299,
    settledAmount: null,
    note: null,
    serviceFee: 19,
  })
  assert.equal(migration.beforeNetAmount, 1_318)
  assert.equal(migration.afterNetAmount, 1_318)
})

test("reconciled foreign-card migration separates the fee from settlement only", () => {
  const migration = buildExpenseAdjustmentNoteMigration({
    id: "foreign",
    baseCurrency: "TWD",
    currency: "EUR",
    paymentMethod: "card",
    amount: 11,
    convertedAmount: 407.85,
    settledAmount: 429,
    reconciledAt: new Date(),
    note: "國外交易服務費 $6",
    serviceFee: 0,
    shopbackReward: 0,
    creditCardReward: 0,
  })

  assert.deepEqual(migration.after, {
    amount: 11,
    convertedAmount: 407.85,
    settledAmount: 423,
    note: null,
    serviceFee: 6,
  })
  assert.equal(migration.beforeNetAmount, 429)
  assert.equal(migration.afterNetAmount, 429)
})
