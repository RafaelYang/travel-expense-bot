import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

function source(path: string) {
  return readFileSync(new URL(path, import.meta.url), "utf8")
}

const schemaSource = source("../prisma/schema.prisma")
const createRouteSource = source("../src/app/api/trips/[tripId]/expenses/route.ts")
const updateRouteSource = source("../src/app/api/trips/[tripId]/expenses/[expenseId]/route.ts")
const tripClientSource = source("../src/app/trips/[tripId]/trip-detail-client.tsx")
const newTripSource = source("../src/app/trips/new/page.tsx")
const settingsSource = source("../src/app/trips/[tripId]/settings/page.tsx")
const recordsPageSource = source("../src/app/trips/[tripId]/records/page.tsx")
const recordsClientSource = source("../src/app/trips/[tripId]/records/records-client.tsx")
const batchSource = source("../src/components/batch-reconcile-modal.tsx")

test("trip and expense schemas persist the adjustment toggle and three base-currency values", () => {
  assert.match(schemaSource, /expenseAdjustmentsEnabled Boolean @default\(false\)/u)
  assert.match(schemaSource, /serviceFee\s+Float\s+@default\(0\)/u)
  assert.match(schemaSource, /shopbackReward\s+Float\s+@default\(0\)/u)
  assert.match(schemaSource, /creditCardReward\s+Float\s+@default\(0\)/u)
})

test("expense APIs validate non-negative finite adjustments and guard the trip setting", () => {
  for (const routeSource of [createRouteSource, updateRouteSource]) {
    for (const field of ["serviceFee", "shopbackReward", "creditCardReward"]) {
      assert.match(routeSource, new RegExp(`${field}: z\\.number\\(\\)\\.nonnegative\\(\\)\\.finite\\(\\)`))
    }
    assert.match(routeSource, /expenseAdjustmentsEnabled/u)
  }
  assert.match(createRouteSource, /hasAdjustments && !trip\?\.expenseAdjustmentsEnabled/u)
  assert.match(updateRouteSource, /adjustmentsChanged && !expenseAdjustmentsEnabled/u)
})

test("new and existing trips let users choose whether adjustment inputs are shown", () => {
  assert.match(newTripSource, /expenseAdjustmentsEnabled: false/u)
  assert.match(newTripSource, /checked=\{form\.expenseAdjustmentsEnabled\}/u)
  assert.match(settingsSource, /checked=\{editForm\.expenseAdjustmentsEnabled\}/u)
  assert.match(settingsSource, /expenseAdjustmentsEnabled: Boolean\(data\.expenseAdjustmentsEnabled\)/u)
  assert.match(tripClientSource, /expenseAdjustmentsEnabled && form\.paymentMethod === 'card'/u)
})

test("create, edit, records, and batch reconciliation all expose the three numeric fields", () => {
  assert.match(tripClientSource, /function ExpenseAdjustmentFields/u)
  assert.match(tripClientSource, /type="number"[\s\S]*inputMode="decimal"[\s\S]*step="any"/u)
  assert.match(tripClientSource, /serviceFee: data\.serviceFee \?\? 0/u)
  for (const field of ["serviceFee", "shopbackReward", "creditCardReward"]) {
    assert.match(recordsPageSource, new RegExp(`${field}: true`))
    assert.match(recordsClientSource, new RegExp(`${field}: number`))
    assert.match(batchSource, new RegExp(`${field}: parseAdjustment`))
  }
  assert.match(recordsClientSource, /getExpenseBaseAmount\(expense, initialTrip\.baseCurrency\)/u)
})
