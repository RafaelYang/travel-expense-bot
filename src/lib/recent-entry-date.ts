export const RECENT_ENTRY_WINDOW_MS = 10 * 60 * 1_000

const RECENT_ENTRY_DATE_STORAGE_PREFIX = "travel-expense:recent-entry-date:v1"
const CALENDAR_DAY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/

export interface RecentEntryDateScope {
  userId: string
  tripId: string
}

export interface RecentEntryDateStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

interface RecentEntryDateRecord {
  day: string
  expiresAt: number
}

export interface RecentEntryDaySnapshot {
  day: string
  expiresAt: number | null
}

function calendarDayParts(value: string) {
  const match = CALENDAR_DAY_PATTERN.exec(value)
  if (!match) return null

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  if (year < 1 || year > 9_999 || month < 1 || month > 12 || day < 1 || day > 31) {
    return null
  }

  // setUTCFullYear avoids Date's special handling of years 0-99 and also lets
  // us reject rollover values such as 2026-02-30.
  const parsed = new Date(0)
  parsed.setUTCHours(0, 0, 0, 0)
  parsed.setUTCFullYear(year, month - 1, day)
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    return null
  }

  return { year, month, day }
}

export function isCalendarDay(value: unknown): value is string {
  return typeof value === "string" && calendarDayParts(value) !== null
}

export function getLocalCalendarDay(value: Date = new Date()) {
  if (!Number.isFinite(value.getTime())) {
    throw new RangeError("A valid date is required")
  }

  const year = String(value.getFullYear()).padStart(4, "0")
  const month = String(value.getMonth() + 1).padStart(2, "0")
  const day = String(value.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

/**
 * Convert a calendar-only value to a local-noon instant for the existing
 * DateTime APIs. Noon avoids the common previous-day rollover caused by
 * parsing a bare YYYY-MM-DD value as UTC midnight.
 */
export function calendarDayToLocalNoonIso(day: string) {
  const parts = calendarDayParts(day)
  if (!parts) {
    throw new RangeError("Calendar day must use a valid YYYY-MM-DD value")
  }

  const localNoon = new Date(0)
  localNoon.setFullYear(parts.year, parts.month - 1, parts.day)
  localNoon.setHours(12, 0, 0, 0)
  return localNoon.toISOString()
}

function assertScope(scope: RecentEntryDateScope) {
  if (!scope.userId.trim() || !scope.tripId.trim()) {
    throw new Error("Recent entry date requires both userId and tripId")
  }
}

export function getRecentEntryDateStorageKey(scope: RecentEntryDateScope) {
  assertScope(scope)
  return [
    RECENT_ENTRY_DATE_STORAGE_PREFIX,
    encodeURIComponent(scope.userId),
    encodeURIComponent(scope.tripId),
  ].join(":")
}

function getBrowserStorage(): RecentEntryDateStorage | null {
  if (typeof window === "undefined") return null
  try {
    return window.localStorage
  } catch {
    return null
  }
}

function resolveStorage(storage: RecentEntryDateStorage | null | undefined) {
  return storage === undefined ? getBrowserStorage() : storage
}

function discardStoredRecord(storage: RecentEntryDateStorage, key: string) {
  try {
    storage.removeItem(key)
  } catch {
    // Storage can be blocked in privacy modes. Falling back to today is safe.
  }
}

/**
 * Return the last successfully submitted entry day while it is still valid.
 * Missing, corrupt, or expired state is discarded and falls back to today in
 * the device's local calendar.
 */
export function readRecentEntryDaySnapshot(
  userId: string,
  tripId: string,
  now: Date = new Date(),
  storageOverride?: RecentEntryDateStorage | null,
): RecentEntryDaySnapshot {
  const today = getLocalCalendarDay(now)
  const storage = resolveStorage(storageOverride)
  if (!storage) return { day: today, expiresAt: null }

  const scope = { userId, tripId }
  const key = getRecentEntryDateStorageKey(scope)
  let raw: string | null
  try {
    raw = storage.getItem(key)
  } catch {
    return { day: today, expiresAt: null }
  }
  if (!raw) return { day: today, expiresAt: null }

  try {
    const record = JSON.parse(raw) as Partial<RecentEntryDateRecord> | null
    if (
      !record ||
      !isCalendarDay(record.day) ||
      typeof record.expiresAt !== "number" ||
      !Number.isFinite(record.expiresAt) ||
      record.expiresAt <= now.getTime()
    ) {
      discardStoredRecord(storage, key)
      return { day: today, expiresAt: null }
    }
    return { day: record.day, expiresAt: record.expiresAt }
  } catch {
    discardStoredRecord(storage, key)
    return { day: today, expiresAt: null }
  }
}

export function readRecentEntryDay(
  userId: string,
  tripId: string,
  now: Date = new Date(),
  storageOverride?: RecentEntryDateStorage | null,
) {
  return readRecentEntryDaySnapshot(userId, tripId, now, storageOverride).day
}

/** Save a successful new-entry day for the next ten minutes. */
export function rememberRecentEntryDay(
  userId: string,
  tripId: string,
  day: string,
  now: Date = new Date(),
  storageOverride?: RecentEntryDateStorage | null,
) {
  if (!isCalendarDay(day)) {
    throw new RangeError("Calendar day must use a valid YYYY-MM-DD value")
  }

  if (!Number.isFinite(now.getTime())) {
    throw new RangeError("A valid date is required")
  }

  const storage = resolveStorage(storageOverride)
  if (!storage) return false

  const scope = { userId, tripId }
  const key = getRecentEntryDateStorageKey(scope)
  const record: RecentEntryDateRecord = {
    day,
    expiresAt: now.getTime() + RECENT_ENTRY_WINDOW_MS,
  }
  try {
    storage.setItem(key, JSON.stringify(record))
    return true
  } catch {
    return false
  }
}
