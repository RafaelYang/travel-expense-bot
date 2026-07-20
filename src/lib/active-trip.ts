export const ALL_TRIPS_PATH = "/?view=all"
export const WRITABLE_TRIP_ROLES = ["owner", "member"] as const
export const VISITOR_TIME_ZONE_COOKIE = "travel-time-zone"

const DAY_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/u

export interface ActiveTripCandidate {
  id: string
  startDate: string | Date
  endDate: string | Date
}

function tripBoundaryDayKey(value: string | Date) {
  const serialized = value instanceof Date ? value.toISOString() : value
  return serialized.match(/^(\d{4}-\d{2}-\d{2})/u)?.[1] ?? null
}

function formatCalendarDay(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date)
  const values = new Map(parts.map((part) => [part.type, part.value]))
  return `${values.get("year")}-${values.get("month")}-${values.get("day")}`
}

function normalizeTimeZone(candidate: string | null | undefined) {
  if (!candidate) return null

  let timeZone = candidate
  try {
    timeZone = decodeURIComponent(candidate)
  } catch {
    return null
  }

  try {
    new Intl.DateTimeFormat("en-US", { timeZone }).format()
    return timeZone
  } catch {
    return null
  }
}

export function resolveCalendarTimeZone(
  deviceTimeZone: string | null | undefined,
  visitorTimeZone: string | null | undefined,
) {
  return normalizeTimeZone(deviceTimeZone)
    ?? normalizeTimeZone(visitorTimeZone)
    ?? "UTC"
}

export function getCalendarDayKey(date = new Date(), timeZone = "UTC") {
  if (!Number.isFinite(date.getTime())) {
    throw new Error("date must be valid")
  }

  try {
    return formatCalendarDay(date, timeZone)
  } catch {
    return formatCalendarDay(date, "UTC")
  }
}

export function isAllTripsView(view: string | string[] | undefined) {
  return Array.isArray(view) ? view.includes("all") : view === "all"
}

export function findCurrentTrip<T extends ActiveTripCandidate>(
  trips: readonly T[],
  todayDayKey: string,
) {
  if (!DAY_KEY_PATTERN.test(todayDayKey)) {
    throw new Error("todayDayKey must be a YYYY-MM-DD calendar day")
  }

  return trips
    .map((trip) => ({
      trip,
      startDay: tripBoundaryDayKey(trip.startDate),
      endDay: tripBoundaryDayKey(trip.endDate),
    }))
    .filter((candidate): candidate is { trip: T; startDay: string; endDay: string } => {
      const { startDay, endDay } = candidate
      return startDay !== null
        && endDay !== null
        && startDay <= todayDayKey
        && todayDayKey <= endDay
    })
    .sort((a, b) => (
      b.startDay.localeCompare(a.startDay)
      || a.endDay.localeCompare(b.endDay)
      || a.trip.id.localeCompare(b.trip.id)
    ))[0]?.trip
}
