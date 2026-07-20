import { getCalendarDayKey } from "./active-trip.ts"
import { isCalendarDay } from "./recent-entry-date.ts"

export const TIMELINE_ITEM_KINDS = ["expense", "deposit", "exchange"] as const

export type TimelineItemKind = (typeof TIMELINE_ITEM_KINDS)[number]
export type TimelineItemKey = `${TimelineItemKind}:${string}`
export type TimelineOrderMap = Record<string, TimelineItemKey[]>

export interface TimelineTransaction {
  id: string
  kind: TimelineItemKind
  date: string | Date
  createdAt: string | Date
}

const ITEM_KEY_PATTERN = /^(expense|deposit|exchange):([^:\s]{1,200})$/u
const MAX_DAYS = 4_000
const MAX_ITEMS_PER_DAY = 10_000

export class TimelineOrderError extends Error {
  readonly code:
    | "invalid-item"
    | "invalid-key"
    | "missing-item"
    | "different-day"

  constructor(
    message: string,
    code:
      | "invalid-item"
      | "invalid-key"
      | "missing-item"
      | "different-day",
  ) {
    super(message)
    this.name = "TimelineOrderError"
    this.code = code
  }
}

export function timelineItemKey(kind: TimelineItemKind, id: string): TimelineItemKey {
  const key = `${kind}:${id}`
  if (!ITEM_KEY_PATTERN.test(key)) {
    throw new TimelineOrderError("timeline item id is invalid", "invalid-item")
  }
  return key as TimelineItemKey
}

export function parseTimelineItemKey(value: unknown): {
  kind: TimelineItemKind
  id: string
} | null {
  if (typeof value !== "string") return null
  const match = ITEM_KEY_PATTERN.exec(value)
  if (!match) return null
  return { kind: match[1] as TimelineItemKind, id: match[2] }
}

/**
 * Database JSON is intentionally treated as untrusted input. Keep only valid
 * day buckets and unique, typed transaction keys. Stale-but-valid keys are
 * retained because the caller needs the authoritative trip records to decide
 * whether an entry was deleted or moved to another day.
 */
export function parseTimelineOrder(value: unknown): TimelineOrderMap {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {}

  const parsed: TimelineOrderMap = {}
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([dayKey]) => isCalendarDay(dayKey))
    .sort(([left], [right]) => right.localeCompare(left))
    .slice(0, MAX_DAYS)

  for (const [dayKey, rawKeys] of entries) {
    if (!Array.isArray(rawKeys)) continue

    const seen = new Set<string>()
    const keys: TimelineItemKey[] = []
    for (const rawKey of rawKeys) {
      if (keys.length >= MAX_ITEMS_PER_DAY) break
      const key = typeof rawKey === "string" ? rawKey : ""
      if (!parseTimelineItemKey(key) || seen.has(key)) continue
      seen.add(key)
      keys.push(key as TimelineItemKey)
    }

    if (keys.length > 0) parsed[dayKey] = keys
  }

  return parsed
}

function validInstant(value: string | Date, field: "date" | "createdAt") {
  const date = value instanceof Date ? value : new Date(value)
  if (!Number.isFinite(date.getTime())) {
    throw new TimelineOrderError(`timeline ${field} is invalid`, "invalid-item")
  }
  return date
}

export function timelineItemDateKey(item: TimelineTransaction, timeZone: string) {
  return getCalendarDayKey(validInstant(item.date, "date"), timeZone)
}

function compareCreatedAtDescending(left: TimelineTransaction, right: TimelineTransaction) {
  return validInstant(right.createdAt, "createdAt").getTime()
    - validInstant(left.createdAt, "createdAt").getTime()
}

/**
 * Calendar days remain newest-first. Within one day, records that have not yet
 * been saved in the manual order are considered newly added and appear first,
 * newest creation first. Existing manually ordered records follow unchanged.
 */
export function sortTimelineTransactions<T extends TimelineTransaction>(
  items: readonly T[],
  rawOrder: unknown,
  timeZone: string,
): T[] {
  const order = parseTimelineOrder(rawOrder)
  const metadata = new Map(items.map((item) => {
    const key = timelineItemKey(item.kind, item.id)
    return [key, { dayKey: timelineItemDateKey(item, timeZone), key }] as const
  }))
  const manualRanksByDay = new Map(Object.entries(order).map(([dayKey, keys]) => [
    dayKey,
    new Map(keys.map((key, index) => [key, index])),
  ]))

  return [...items].sort((left, right) => {
    const leftMetadata = metadata.get(timelineItemKey(left.kind, left.id))!
    const rightMetadata = metadata.get(timelineItemKey(right.kind, right.id))!
    const dayComparison = rightMetadata.dayKey.localeCompare(leftMetadata.dayKey)
    if (dayComparison !== 0) return dayComparison

    const manualRanks = manualRanksByDay.get(leftMetadata.dayKey) ?? new Map()
    const leftRank = manualRanks.get(leftMetadata.key)
    const rightRank = manualRanks.get(rightMetadata.key)

    if (leftRank === undefined && rightRank !== undefined) return -1
    if (leftRank !== undefined && rightRank === undefined) return 1
    if (leftRank !== undefined && rightRank !== undefined) return leftRank - rightRank

    return compareCreatedAtDescending(left, right)
      || leftMetadata.key.localeCompare(rightMetadata.key)
  })
}

/**
 * Moves one authoritative trip item relative to another. Both keys must exist
 * in the supplied trip records and belong to the same browser-calendar day.
 * The stored bucket is normalized to the complete day, so a client rendering
 * only the first few transactions cannot accidentally discard hidden rows.
 */
export function moveTimelineItem<T extends TimelineTransaction>(
  items: readonly T[],
  rawOrder: unknown,
  activeKeyValue: string,
  overKeyValue: string,
  timeZone: string,
): TimelineOrderMap {
  const activeParsed = parseTimelineItemKey(activeKeyValue)
  const overParsed = parseTimelineItemKey(overKeyValue)
  if (!activeParsed || !overParsed) {
    throw new TimelineOrderError("timeline item key is invalid", "invalid-key")
  }

  const byKey = new Map(items.map((item) => [timelineItemKey(item.kind, item.id), item] as const))
  const activeKey = timelineItemKey(activeParsed.kind, activeParsed.id)
  const overKey = timelineItemKey(overParsed.kind, overParsed.id)
  const active = byKey.get(activeKey)
  const over = byKey.get(overKey)
  if (!active || !over) {
    throw new TimelineOrderError("timeline item does not belong to this trip", "missing-item")
  }

  const activeDay = timelineItemDateKey(active, timeZone)
  const overDay = timelineItemDateKey(over, timeZone)
  if (activeDay !== overDay) {
    throw new TimelineOrderError("timeline items must belong to the same day", "different-day")
  }

  const order = parseTimelineOrder(rawOrder)
  if (activeKey === overKey) return order

  const dayKeys = sortTimelineTransactions(items, order, timeZone)
    .filter((item) => timelineItemDateKey(item, timeZone) === activeDay)
    .map((item) => timelineItemKey(item.kind, item.id))
  const oldIndex = dayKeys.indexOf(activeKey)
  const newIndex = dayKeys.indexOf(overKey)
  if (oldIndex < 0 || newIndex < 0) {
    throw new TimelineOrderError("timeline item does not belong to this trip", "missing-item")
  }

  const [moved] = dayKeys.splice(oldIndex, 1)
  dayKeys.splice(newIndex, 0, moved)

  return {
    ...order,
    [activeDay]: dayKeys,
  }
}
