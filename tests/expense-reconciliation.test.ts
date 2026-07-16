import assert from "node:assert/strict"
import test from "node:test"

import {
  buildReconciliationPayload,
  getInitialActualCharge,
  isForeignCardExpense,
} from "../src/lib/expense-reconciliation.ts"

test("base-currency card reconciliation does not send a settlement amount", () => {
  const result = buildReconciliationPayload(
    { paymentMethod: "card", currency: "twd" },
    "TWD",
    "999",
  )

  assert.deepEqual(result, { ok: true, payload: { reconciled: true } })
})

test("foreign-card reconciliation requires a finite positive actual charge", () => {
  const expense = { paymentMethod: "card" as const, currency: "EUR" }

  for (const value of [undefined, "", "0", "-1", "not-a-number", Number.NaN]) {
    assert.deepEqual(
      buildReconciliationPayload(expense, "TWD", value),
      { ok: false, reason: "actual_charge_required" },
    )
  }
})

test("foreign-card reconciliation sends the actual base-currency charge", () => {
  const result = buildReconciliationPayload(
    { paymentMethod: "card", currency: "EUR" },
    "TWD",
    "3589.5",
  )

  assert.deepEqual(result, {
    ok: true,
    payload: { reconciled: true, settledAmount: 3589.5 },
  })
})

test("foreign-card detection ignores currency casing and excludes cash", () => {
  assert.equal(isForeignCardExpense({ paymentMethod: "card", currency: "eur" }, "EUR"), false)
  assert.equal(isForeignCardExpense({ paymentMethod: "card", currency: "eur" }, "twd"), true)
  assert.equal(isForeignCardExpense({ paymentMethod: "cash", currency: "EUR" }, "TWD"), false)
})

test("nullable API settlement values initialize as an empty actual-charge input", () => {
  assert.equal(getInitialActualCharge(null), "")
  assert.equal(getInitialActualCharge(undefined), "")
  assert.equal(getInitialActualCharge(Number.NaN), "")
  assert.equal(getInitialActualCharge(3180), "3180")
})
