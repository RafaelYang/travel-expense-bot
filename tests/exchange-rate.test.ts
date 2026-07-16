import test from "node:test"
import assert from "node:assert/strict"
import {
  createExchangeRateHistoryRange,
  extractCurrencyBeaconHistoryRows,
  filterValidExchangeRates,
  parseCurrencyBeaconHistory,
} from "../src/lib/exchange-rate.ts"
import {
  calculateReferenceConversion,
  invertRatePoints,
  summarizeRateTrend,
} from "../src/lib/exchange-rate-view.ts"

test("exchange-rate provider values keep only finite positive ISO-code rates", () => {
  assert.deepEqual(filterValidExchangeRates({
    TWD: 34.8,
    USD: 0,
    JPY: -1,
    EUR: Number.POSITIVE_INFINITY,
    GBP: "0.82",
    usd: 1.1,
    TOOLONG: 2,
  }), { TWD: 34.8 })
})

test("CurrencyBeacon history is sorted, validated, and limited to the newest quotes", () => {
  const rows = {
    "2026-07-09": { TWD: 34.1 },
    "2026-07-07": { TWD: 33.9 },
    "2026-07-08": { TWD: 34 },
    "2026-07-10": { TWD: 0 },
    "2026-07-11": { TWD: 34.2 },
    "2026-07-12": { TWD: 34.3 },
    "2026-07-13": { TWD: 34.4 },
    "2026-07-14": { TWD: 34.5 },
    "2026-07-15": { TWD: 34.6 },
    "2026-07-16": { TWD: 34.7 },
    invalid: { TWD: 99 },
  }

  assert.deepEqual(parseCurrencyBeaconHistory(rows, "twd", 7), [
    { date: "2026-07-09", rate: 34.1 },
    { date: "2026-07-11", rate: 34.2 },
    { date: "2026-07-12", rate: 34.3 },
    { date: "2026-07-13", rate: 34.4 },
    { date: "2026-07-14", rate: 34.5 },
    { date: "2026-07-15", rate: 34.6 },
    { date: "2026-07-16", rate: 34.7 },
  ])
})

test("CurrencyBeacon history accepts both live direct-date and documented nested shapes", () => {
  const rows = { "2026-07-16": { TWD: 34.7 } }
  assert.equal(extractCurrencyBeaconHistoryRows(rows), rows)
  assert.equal(extractCurrencyBeaconHistoryRows({ rates: rows }), rows)
})

test("history range looks back beyond seven dates without crossing the requested end date", () => {
  assert.deepEqual(
    createExchangeRateHistoryRange(new Date("2026-07-17T23:30:00Z"), 7),
    { startDate: "2026-07-07", endDate: "2026-07-17" },
  )
})

test("calculator and reversed trend reuse the same raw quote", () => {
  const points = [
    { date: "2026-07-15", rate: 34 },
    { date: "2026-07-16", rate: 35.7 },
  ]
  const converted = calculateReferenceConversion(100, 35.7)
  assert.ok(converted !== null && Math.abs(converted - 3570) < 1e-9)
  assert.equal(calculateReferenceConversion(-1, 35.7), null)
  assert.equal(calculateReferenceConversion(100, 0), null)

  const inverted = invertRatePoints(points)
  assert.ok(Math.abs(inverted[0].rate - 1 / 34) < 1e-12)
  assert.ok(Math.abs(inverted[1].rate - 1 / 35.7) < 1e-12)
  const trend = summarizeRateTrend(points)
  assert.ok(trend)
  assert.ok(Math.abs(trend.changePercent - 5) < 1e-12)
  assert.equal(trend.minimum, 34)
  assert.equal(trend.maximum, 35.7)
})
