import assert from "node:assert/strict"
import test from "node:test"

import {
  getCurrenciesFromCountries,
  parseTripCountryPlan,
  resolveTripDayCountry,
  resolveTripDayCurrency,
} from "../src/lib/countries.ts"

function encodedPlan(list: string[], daily: unknown[]) {
  return [JSON.stringify({ list, daily })]
}

test("trip country plans normalize legacy codes without moving encoded daily indexes", () => {
  assert.deepEqual(parseTripCountryPlan(["jp", "JP", "bad"]), {
    list: ["JP"],
    daily: [],
  })

  const plan = parseTripCountryPlan(encodedPlan(
    ["at", "cz", "hu"],
    ["AT", "", "cz", "not-a-code", "HU"],
  ))
  assert.deepEqual(plan.list, ["AT", "CZ", "HU"])
  assert.deepEqual(plan.daily, ["AT", null, "CZ", null, "HU"])
})

test("trip country plans unwrap the nested payload written by older trip creation", () => {
  const inner = JSON.stringify({
    list: ["AT", "CZ", "HU"],
    daily: ["AT", "AT", "CZ", "HU"],
  })
  const nested = [JSON.stringify({
    list: [inner],
    daily: [inner, inner, inner, inner],
  })]

  assert.deepEqual(parseTripCountryPlan(nested), {
    list: ["AT", "CZ", "HU"],
    daily: ["AT", "AT", "CZ", "HU"],
  })
  assert.deepEqual(getCurrenciesFromCountries(nested), ["EUR", "CZK", "HUF"])
})

test("reference currency follows the configured country for each inclusive trip day", () => {
  const countries = encodedPlan(
    ["AT", "CZ", "HU"],
    ["AT", "AT", "AT", "AT", "AT", "CZ", "CZ", "CZ", "HU", "HU", "HU", "HU"],
  )
  const trip = {
    countries,
    startDate: "2026-07-17T00:00:00.000Z",
    endDate: "2026-07-28T00:00:00.000Z",
    baseCurrency: "TWD",
  }

  assert.equal(resolveTripDayCountry({ ...trip, day: "2026-07-17" }), "AT")
  assert.equal(resolveTripDayCurrency({ ...trip, day: "2026-07-21" }), "EUR")
  assert.equal(resolveTripDayCurrency({ ...trip, day: "2026-07-22" }), "CZK")
  assert.equal(resolveTripDayCurrency({ ...trip, day: "2026-07-25" }), "HUF")
  assert.equal(resolveTripDayCountry({ ...trip, day: "2026-07-28" }), "HU")
})

test("days outside the trip keep the existing default-currency fallback", () => {
  const trip = {
    countries: encodedPlan(["AT"], ["AT", "AT"]),
    startDate: "2026-07-17",
    endDate: "2026-07-18",
    baseCurrency: "TWD",
  }

  assert.equal(resolveTripDayCurrency({ ...trip, day: "2026-07-16" }), null)
  assert.equal(resolveTripDayCurrency({ ...trip, day: "2026-07-19" }), null)
})

test("legacy multi-country trips distribute destinations when daily settings are absent", () => {
  const trip = {
    countries: ["AT", "CZ", "HU"],
    startDate: "2026-03-27T23:00:00.000Z",
    endDate: "2026-04-01T00:00:00.000Z",
    baseCurrency: "TWD",
  }

  assert.equal(resolveTripDayCurrency({ ...trip, day: "2026-03-27" }), "EUR")
  assert.equal(resolveTripDayCurrency({ ...trip, day: "2026-03-29" }), "CZK")
  assert.equal(resolveTripDayCurrency({ ...trip, day: "2026-04-01" }), "HUF")
})

test("a destination using the base currency falls back to another trip currency", () => {
  const trip = {
    countries: encodedPlan(["TW", "JP"], ["TW", "JP"]),
    startDate: "2026-07-17",
    endDate: "2026-07-18",
    baseCurrency: "TWD",
  }

  assert.equal(resolveTripDayCurrency({ ...trip, day: "2026-07-17" }), "JPY")
  assert.equal(resolveTripDayCurrency({ ...trip, day: "invalid" }), null)
})
