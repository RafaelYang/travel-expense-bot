import assert from "node:assert/strict"
import test from "node:test"

import {
  ALL_TRIPS_PATH,
  findCurrentTrip,
  getCalendarDayKey,
  isAllTripsView,
  resolveCalendarTimeZone,
  VISITOR_TIME_ZONE_COOKIE,
  WRITABLE_TRIP_ROLES,
} from "../src/lib/active-trip.ts"

const trips = [
  { id: "past", startDate: "2026-07-01T00:00:00.000Z", endDate: "2026-07-10T00:00:00.000Z" },
  { id: "current", startDate: "2026-07-17T00:00:00.000Z", endDate: "2026-07-28T00:00:00.000Z" },
  { id: "future", startDate: "2026-08-01T00:00:00.000Z", endDate: "2026-08-10T00:00:00.000Z" },
]

test("current trip detection includes both travel boundary days", () => {
  assert.equal(findCurrentTrip(trips, "2026-07-16"), undefined)
  assert.equal(findCurrentTrip(trips, "2026-07-17")?.id, "current")
  assert.equal(findCurrentTrip(trips, "2026-07-28")?.id, "current")
  assert.equal(findCurrentTrip(trips, "2026-07-29"), undefined)
})

test("overlapping trips choose the latest start, earliest end, then stable id", () => {
  const overlapping = [
    { id: "z", startDate: "2026-07-18", endDate: "2026-07-30" },
    { id: "b", startDate: "2026-07-20", endDate: "2026-07-26" },
    { id: "a", startDate: "2026-07-20", endDate: "2026-07-26" },
    { id: "long", startDate: "2026-07-20", endDate: "2026-07-28" },
  ]

  assert.equal(findCurrentTrip(overlapping, "2026-07-20")?.id, "a")
  assert.equal(findCurrentTrip([...overlapping].reverse(), "2026-07-20")?.id, "a")
})

test("calendar day follows the visitor time zone with an UTC fallback", () => {
  const instant = new Date("2026-07-17T00:30:00.000Z")
  assert.equal(getCalendarDayKey(instant, "Europe/Vienna"), "2026-07-17")
  assert.equal(getCalendarDayKey(instant, "America/Los_Angeles"), "2026-07-16")
  assert.equal(getCalendarDayKey(instant, "not-a-time-zone"), "2026-07-17")
})

test("device time zone takes priority over the visitor IP time zone", () => {
  assert.equal(
    resolveCalendarTimeZone("Europe%2FVienna", "America/Los_Angeles"),
    "Europe/Vienna",
  )
  assert.equal(
    resolveCalendarTimeZone("not-a-time-zone", "Asia/Taipei"),
    "Asia/Taipei",
  )
  assert.equal(resolveCalendarTimeZone("%", "also-invalid"), "UTC")
  assert.equal(VISITOR_TIME_ZONE_COOKIE, "travel-time-zone")
})

test("only the exact all-trips view bypasses smart opening", () => {
  assert.equal(ALL_TRIPS_PATH, "/?view=all")
  assert.equal(isAllTripsView("all"), true)
  assert.equal(isAllTripsView(["summary", "all"]), true)
  assert.equal(isAllTripsView(undefined), false)
  assert.equal(isAllTripsView("active"), false)
  assert.deepEqual(WRITABLE_TRIP_ROLES, ["owner", "member"])
})

test("invalid current day keys fail instead of silently choosing a trip", () => {
  assert.throws(() => findCurrentTrip(trips, "2026/07/20"), /YYYY-MM-DD/)
})
