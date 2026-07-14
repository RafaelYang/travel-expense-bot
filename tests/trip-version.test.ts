import assert from "node:assert/strict"
import test from "node:test"
import { createTripVersion } from "../src/lib/trip-version.ts"

const base = {
  updatedAt: "2026-07-14T00:00:00.000Z",
  expenses: [
    { id: "expense-b", updatedAt: "2026-07-14T00:00:02.000Z" },
    { id: "expense-a", updatedAt: "2026-07-14T00:00:01.000Z" },
  ],
  deposits: [
    {
      id: "deposit-a",
      amount: 100,
      currency: "TWD",
      note: "cash",
      createdAt: "2026-07-14T00:00:03.000Z",
    },
  ],
}

test("trip version is stable regardless of relation ordering", () => {
  const reordered = {
    ...base,
    expenses: [...base.expenses].reverse(),
  }

  assert.equal(createTripVersion(base), createTripVersion(reordered))
})

test("trip version changes when a transaction changes", () => {
  const changed = {
    ...base,
    deposits: [{ ...base.deposits[0], amount: 200 }],
  }

  assert.notEqual(createTripVersion(base), createTripVersion(changed))
})
