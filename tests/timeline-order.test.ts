import assert from "node:assert/strict"
import test from "node:test"

import {
  moveTimelineItem,
  parseTimelineItemKey,
  parseTimelineOrder,
  sortTimelineTransactions,
  TimelineOrderError,
  timelineItemKey,
  type TimelineTransaction,
} from "../src/lib/timeline-order.ts"

function item(
  kind: TimelineTransaction["kind"],
  id: string,
  date: string,
  createdAt: string,
): TimelineTransaction {
  return { kind, id, date, createdAt }
}

const items = [
  item("expense", "new", "2026-07-20T10:00:00.000Z", "2026-07-22T10:00:00.000Z"),
  item("deposit", "unmapped-old", "2026-07-20T11:00:00.000Z", "2026-07-20T11:00:00.000Z"),
  item("expense", "manual-first", "2026-07-20T12:00:00.000Z", "2026-07-21T12:00:00.000Z"),
  item("exchange", "manual-second", "2026-07-20T13:00:00.000Z", "2026-07-21T13:00:00.000Z"),
  item("expense", "previous-day", "2026-07-19T23:00:00.000Z", "2026-07-23T09:00:00.000Z"),
]

test("timeline keys are typed and persisted order JSON is sanitized", () => {
  assert.equal(timelineItemKey("expense", "abc"), "expense:abc")
  assert.deepEqual(parseTimelineItemKey("exchange:123"), { kind: "exchange", id: "123" })
  assert.equal(parseTimelineItemKey("unknown:123"), null)
  assert.throws(() => timelineItemKey("expense", "bad:id"), TimelineOrderError)

  assert.deepEqual(parseTimelineOrder({
    "2026-07-19": ["expense:a", "expense:a", "bad", 42],
    "2026-07-20": ["deposit:b", "exchange:c"],
    "2026/07/21": ["expense:d"],
    "2026-02-30": ["expense:impossible-day"],
    "2026-07-22": "expense:not-an-array",
  }), {
    "2026-07-20": ["deposit:b", "exchange:c"],
    "2026-07-19": ["expense:a"],
  })
  assert.deepEqual(parseTimelineOrder(null), {})
})

test("days sort descending while new unmapped items precede the saved manual order", () => {
  const sorted = sortTimelineTransactions(items, {
    "2026-07-20": ["expense:manual-first", "exchange:manual-second"],
  }, "UTC")

  assert.deepEqual(sorted.map((entry) => timelineItemKey(entry.kind, entry.id)), [
    "expense:new",
    "deposit:unmapped-old",
    "expense:manual-first",
    "exchange:manual-second",
    "expense:previous-day",
  ])
})

test("unmapped items use immutable creation time descending with a stable key tie-break", () => {
  const createdAt = "2026-07-22T10:00:00.000Z"
  const sorted = sortTimelineTransactions([
    item("expense", "b", "2026-07-20", createdAt),
    item("expense", "a", "2026-07-20", createdAt),
    item("deposit", "later", "2026-07-20", "2026-07-23T10:00:00.000Z"),
  ], {}, "UTC")

  assert.deepEqual(sorted.map((entry) => timelineItemKey(entry.kind, entry.id)), [
    "deposit:later",
    "expense:a",
    "expense:b",
  ])
})

test("browser calendar time zone controls the date bucket", () => {
  const aroundMidnight = [
    item("expense", "utc-midnight", "2026-07-20T00:30:00.000Z", "2026-07-20T01:00:00.000Z"),
    item("expense", "previous-evening", "2026-07-19T20:00:00.000Z", "2026-07-20T02:00:00.000Z"),
  ]

  assert.deepEqual(
    sortTimelineTransactions(aroundMidnight, {}, "America/Los_Angeles").map((entry) => entry.id),
    ["previous-evening", "utc-midnight"],
  )
  assert.deepEqual(
    sortTimelineTransactions(aroundMidnight, {}, "Europe/Vienna").map((entry) => entry.id),
    ["utc-midnight", "previous-evening"],
  )
})

test("moving two same-day items normalizes the complete authoritative day", () => {
  const moved = moveTimelineItem(
    items,
    {
      "2026-07-20": ["expense:manual-first", "exchange:manual-second"],
      "not-a-day": ["expense:stale"],
    },
    "expense:new",
    "exchange:manual-second",
    "UTC",
  )

  assert.deepEqual(moved, {
    "2026-07-20": [
      "deposit:unmapped-old",
      "expense:manual-first",
      "exchange:manual-second",
      "expense:new",
    ],
  })
})

test("moves reject cross-day, missing, and malformed transaction keys", () => {
  assert.throws(
    () => moveTimelineItem(items, {}, "expense:new", "expense:previous-day", "UTC"),
    (error: unknown) => error instanceof TimelineOrderError && error.code === "different-day",
  )
  assert.throws(
    () => moveTimelineItem(items, {}, "expense:new", "expense:not-in-trip", "UTC"),
    (error: unknown) => error instanceof TimelineOrderError && error.code === "missing-item",
  )
  assert.throws(
    () => moveTimelineItem(items, {}, "expense:new", "javascript:alert", "UTC"),
    (error: unknown) => error instanceof TimelineOrderError && error.code === "invalid-key",
  )
})
