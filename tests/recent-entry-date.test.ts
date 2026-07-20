import assert from "node:assert/strict"
import test from "node:test"

import {
  calendarDayToLocalNoonIso,
  getLocalCalendarDay,
  getRecentEntryDateStorageKey,
  isCalendarDay,
  readRecentEntryDay,
  readRecentEntryDaySnapshot,
  RECENT_ENTRY_WINDOW_MS,
  rememberRecentEntryDay,
  type RecentEntryDateStorage,
} from "../src/lib/recent-entry-date.ts"

class MemoryStorage implements RecentEntryDateStorage {
  values = new Map<string, string>()
  removed: string[] = []

  getItem(key: string) {
    return this.values.get(key) ?? null
  }

  setItem(key: string, value: string) {
    this.values.set(key, value)
  }

  removeItem(key: string) {
    this.removed.push(key)
    this.values.delete(key)
  }
}

const scope = { userId: "user/one", tripId: "trip:vienna" }

test("calendar days are strictly validated", () => {
  assert.equal(isCalendarDay("2026-07-20"), true)
  assert.equal(isCalendarDay("2024-02-29"), true)
  assert.equal(isCalendarDay("2026-02-29"), false)
  assert.equal(isCalendarDay("2026-02-30"), false)
  assert.equal(isCalendarDay("2026-2-03"), false)
  assert.equal(isCalendarDay("2026-13-01"), false)
  assert.equal(isCalendarDay("not-a-date"), false)
})

test("local day formatting and local-noon conversion preserve the selected day", () => {
  const localDate = new Date(2026, 6, 20, 23, 59, 0)
  assert.equal(getLocalCalendarDay(localDate), "2026-07-20")

  const localNoon = new Date(calendarDayToLocalNoonIso("2026-07-20"))
  assert.equal(getLocalCalendarDay(localNoon), "2026-07-20")
  assert.equal(localNoon.getHours(), 12)
  assert.equal(localNoon.getMinutes(), 0)
  assert.throws(
    () => calendarDayToLocalNoonIso("2026-02-30"),
    /valid YYYY-MM-DD/,
  )
})

test("successful entries are remembered until the absolute ten-minute expiry", () => {
  const storage = new MemoryStorage()
  const savedAt = new Date(2026, 6, 20, 9, 0, 0)
  assert.equal(
    rememberRecentEntryDay(scope.userId, scope.tripId, "2026-07-17", savedAt, storage),
    true,
  )

  const key = getRecentEntryDateStorageKey(scope)
  assert.deepEqual(JSON.parse(storage.values.get(key) || "null"), {
    day: "2026-07-17",
    expiresAt: savedAt.getTime() + RECENT_ENTRY_WINDOW_MS,
  })
  assert.equal(readRecentEntryDay(
    scope.userId,
    scope.tripId,
    new Date(savedAt.getTime() + RECENT_ENTRY_WINDOW_MS - 1),
    storage,
  ), "2026-07-17")
  assert.deepEqual(readRecentEntryDaySnapshot(
    scope.userId,
    scope.tripId,
    new Date(savedAt.getTime() + RECENT_ENTRY_WINDOW_MS - 1),
    storage,
  ), {
    day: "2026-07-17",
    expiresAt: savedAt.getTime() + RECENT_ENTRY_WINDOW_MS,
  })

  const expiresAt = new Date(savedAt.getTime() + RECENT_ENTRY_WINDOW_MS)
  assert.equal(
    readRecentEntryDay(scope.userId, scope.tripId, expiresAt, storage),
    getLocalCalendarDay(expiresAt),
  )
  assert.equal(storage.values.has(key), false)
  assert.deepEqual(storage.removed, [key])
})

test("the snapshot expires at exactly ten minutes and exposes no stale deadline", () => {
  const storage = new MemoryStorage()
  const savedAt = new Date(2026, 6, 20, 23, 55, 0)
  const expiresAt = new Date(savedAt.getTime() + RECENT_ENTRY_WINDOW_MS)
  rememberRecentEntryDay(scope.userId, scope.tripId, "2026-07-17", savedAt, storage)

  assert.deepEqual(readRecentEntryDaySnapshot(
    scope.userId,
    scope.tripId,
    expiresAt,
    storage,
  ), {
    day: getLocalCalendarDay(expiresAt),
    expiresAt: null,
  })
  assert.equal(storage.values.has(getRecentEntryDateStorageKey(scope)), false)
})

test("each successful entry renews the ten-minute window", () => {
  const storage = new MemoryStorage()
  const first = new Date(2026, 6, 20, 9, 0, 0)
  const second = new Date(first.getTime() + 9 * 60 * 1_000)

  rememberRecentEntryDay(scope.userId, scope.tripId, "2026-07-17", first, storage)
  rememberRecentEntryDay(scope.userId, scope.tripId, "2026-07-16", second, storage)

  assert.equal(readRecentEntryDay(
    scope.userId,
    scope.tripId,
    new Date(first.getTime() + 11 * 60 * 1_000),
    storage,
  ), "2026-07-16")
  assert.deepEqual(readRecentEntryDaySnapshot(
    scope.userId,
    scope.tripId,
    new Date(first.getTime() + RECENT_ENTRY_WINDOW_MS),
    storage,
  ), {
    day: "2026-07-16",
    expiresAt: second.getTime() + RECENT_ENTRY_WINDOW_MS,
  })
})

test("recent dates are isolated by both user and trip", () => {
  const storage = new MemoryStorage()
  const now = new Date(2026, 6, 20, 9, 0, 0)
  const otherUser = { ...scope, userId: "user-two" }
  const otherTrip = { ...scope, tripId: "trip-two" }

  rememberRecentEntryDay(scope.userId, scope.tripId, "2026-07-17", now, storage)
  rememberRecentEntryDay(otherUser.userId, otherUser.tripId, "2026-07-18", now, storage)
  rememberRecentEntryDay(otherTrip.userId, otherTrip.tripId, "2026-07-19", now, storage)

  assert.equal(readRecentEntryDay(scope.userId, scope.tripId, now, storage), "2026-07-17")
  assert.equal(readRecentEntryDay(otherUser.userId, otherUser.tripId, now, storage), "2026-07-18")
  assert.equal(readRecentEntryDay(otherTrip.userId, otherTrip.tripId, now, storage), "2026-07-19")
  assert.notEqual(getRecentEntryDateStorageKey(scope), getRecentEntryDateStorageKey(otherUser))
  assert.match(getRecentEntryDateStorageKey(scope), /user%2Fone/)
})

test("corrupt stored state is removed and falls back to the local current day", () => {
  const badValues = [
    "not-json",
    JSON.stringify({ day: "2026-02-30", expiresAt: Number.MAX_SAFE_INTEGER }),
    JSON.stringify({ day: "2026-07-17", expiresAt: "later" }),
  ]
  const now = new Date(2026, 6, 20, 9, 0, 0)
  const key = getRecentEntryDateStorageKey(scope)

  for (const value of badValues) {
    const storage = new MemoryStorage()
    storage.values.set(key, value)
    assert.equal(readRecentEntryDay(scope.userId, scope.tripId, now, storage), "2026-07-20")
    assert.equal(storage.values.has(key), false)
  }
})

test("blocked or unavailable storage safely falls back to today", () => {
  const now = new Date(2026, 6, 20, 9, 0, 0)
  const blocked: RecentEntryDateStorage = {
    getItem() { throw new Error("blocked") },
    setItem() { throw new Error("blocked") },
    removeItem() { throw new Error("blocked") },
  }

  assert.equal(readRecentEntryDay(scope.userId, scope.tripId, now, blocked), "2026-07-20")
  assert.equal(rememberRecentEntryDay(scope.userId, scope.tripId, "2026-07-17", now, blocked), false)
  assert.equal(readRecentEntryDay(scope.userId, scope.tripId, now, null), "2026-07-20")
})
