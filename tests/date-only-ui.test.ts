import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const tripDetailSource = readFileSync(
  new URL("../src/app/trips/[tripId]/trip-detail-client.tsx", import.meta.url),
  "utf8",
)
const cashWalletSource = readFileSync(
  new URL("../src/components/cash-wallet-panel.tsx", import.meta.url),
  "utf8",
)
const tripStatsSource = readFileSync(
  new URL("../src/components/trip-stats-modal.tsx", import.meta.url),
  "utf8",
)

function sourceSection(source: string, startMarker: string, endMarker: string) {
  const start = source.indexOf(startMarker)
  const end = source.indexOf(endMarker, start + startMarker.length)
  assert.notEqual(start, -1, `missing section start: ${startMarker}`)
  assert.notEqual(end, -1, `missing section end: ${endMarker}`)
  return source.slice(start, end)
}

function occurrenceCount(source: string, value: string) {
  return source.split(value).length - 1
}

test("transaction forms and details expose calendar dates without time precision", () => {
  const transactionSources = [tripDetailSource, cashWalletSource, tripStatsSource]

  for (const source of transactionSources) {
    assert.doesNotMatch(source, /datetime-local/)
    assert.doesNotMatch(source, /HH:mm/)
  }

  assert.match(tripDetailSource, /type="date"/)
  assert.match(cashWalletSource, /type="date"/)
})

test("new expenses, deposits, and cash exchanges submit their selected calendar day at local noon", () => {
  const expenseFormSource = sourceSection(
    tripDetailSource,
    "function ExpenseForm(",
    "// === 花費詳情 / 編輯 Modal ===",
  )

  // ExpenseForm has one POST body for an expense and one for a deposit.
  assert.equal(
    occurrenceCount(expenseFormSource, "calendarDayToLocalNoonIso(form.date)"),
    2,
  )
  assert.equal(
    occurrenceCount(cashWalletSource, "calendarDayToLocalNoonIso(date)"),
    1,
  )
})

test("successful expense/deposit and cash-exchange submissions remember the selected day", () => {
  const expenseFormSource = sourceSection(
    tripDetailSource,
    "function ExpenseForm(",
    "// === 花費詳情 / 編輯 Modal ===",
  )
  const expenseFailureGuard = expenseFormSource.indexOf("if (!res.ok || !data)")
  const expenseRemember = expenseFormSource.indexOf(
    "rememberRecentEntryDay(currentUserId, tripId, form.date)",
  )
  assert.notEqual(expenseFailureGuard, -1)
  assert.ok(expenseRemember > expenseFailureGuard)
  assert.equal(
    occurrenceCount(
      expenseFormSource,
      "rememberRecentEntryDay(currentUserId, tripId, form.date)",
    ),
    1,
  )

  const exchangeFailureGuard = cashWalletSource.indexOf("if (!response.ok)")
  const exchangeRemember = cashWalletSource.indexOf(
    "rememberRecentEntryDay(currentUserId, tripId, date)",
  )
  assert.notEqual(exchangeFailureGuard, -1)
  assert.ok(exchangeRemember > exchangeFailureGuard)
  assert.equal(
    occurrenceCount(
      cashWalletSource,
      "rememberRecentEntryDay(currentUserId, tripId, date)",
    ),
    1,
  )
})
