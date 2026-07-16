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
  cashWallets: [
    { id: "wallet-b", balance: 2_000, updatedAt: "2026-07-14T00:00:05.000Z" },
    { id: "wallet-a", balance: 1_000, updatedAt: "2026-07-14T00:00:04.000Z" },
  ],
  cashExchanges: [
    {
      id: "exchange-a",
      type: "buy",
      foreignCurrency: "JPY",
      foreignAmount: 30_000,
      baseAmount: 6_200,
      exchangeRate: 6_200 / 30_000,
      date: "2026-07-14T00:00:06.000Z",
      note: "airport",
      createdAt: "2026-07-14T00:00:06.000Z",
    },
  ],
}

test("trip version is stable regardless of relation ordering", () => {
  const reordered = {
    ...base,
    expenses: [...base.expenses].reverse(),
    cashWallets: [...base.cashWallets].reverse(),
  }

  assert.equal(createTripVersion(base), createTripVersion(reordered))
})

test("trip version changes when a cash wallet balance changes", () => {
  const changed = {
    ...base,
    cashWallets: [{ ...base.cashWallets[0], balance: 1_500 }, base.cashWallets[1]],
  }

  assert.notEqual(createTripVersion(base), createTripVersion(changed))
})

test("trip version changes when a transaction changes", () => {
  const changed = {
    ...base,
    deposits: [{ ...base.deposits[0], amount: 200 }],
  }

  assert.notEqual(createTripVersion(base), createTripVersion(changed))
})

test("trip version changes when a cash exchange date changes", () => {
  const changed = {
    ...base,
    cashExchanges: [{
      ...base.cashExchanges[0],
      date: "2026-07-15T00:00:06.000Z",
    }],
  }

  assert.notEqual(createTripVersion(base), createTripVersion(changed))
})

test("trip version changes when a cash exchange note changes", () => {
  const changed = {
    ...base,
    cashExchanges: [{ ...base.cashExchanges[0], note: "hotel" }],
  }

  assert.notEqual(createTripVersion(base), createTripVersion(changed))
})
