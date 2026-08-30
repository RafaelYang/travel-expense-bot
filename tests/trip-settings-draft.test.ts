import assert from "node:assert/strict"
import test from "node:test"
import {
  isTripSettingsDraftDirty,
  type TripSettingsDraft,
} from "../src/lib/trip-settings-draft.ts"

const savedDraft: TripSettingsDraft = {
  name: "Central Europe",
  description: "Summer trip",
  startDate: "2026-07-17",
  endDate: "2026-07-28",
  baseCurrency: "TWD",
  expenseAdjustmentsEnabled: false,
  coverImage: "https://example.com/cover.jpg",
  countriesList: ["AT", "CZ", "HU"],
  dailyCountries: ["AT", "AT", "CZ", "HU"],
}

function copyDraft(): TripSettingsDraft {
  return {
    ...savedDraft,
    countriesList: [...savedDraft.countriesList],
    dailyCountries: [...savedDraft.dailyCountries],
  }
}

test("settings draft stays clean before loading and across equivalent copies", () => {
  assert.equal(isTripSettingsDraftDirty(null, copyDraft()), false)
  assert.equal(isTripSettingsDraftDirty(savedDraft, copyDraft()), false)
})

test("every scalar trip setting participates in dirty detection", () => {
  const scalarChanges: Array<[keyof TripSettingsDraft, string | boolean]> = [
    ["name", "Another trip"],
    ["description", "Updated description"],
    ["startDate", "2026-07-18"],
    ["endDate", "2026-07-29"],
    ["baseCurrency", "EUR"],
    ["expenseAdjustmentsEnabled", true],
    ["coverImage", "https://example.com/new-cover.jpg"],
  ]

  for (const [key, value] of scalarChanges) {
    assert.equal(
      isTripSettingsDraftDirty(savedDraft, { ...copyDraft(), [key]: value }),
      true,
      `${key} should mark the draft dirty`,
    )
  }
})

test("country list changes participate in dirty detection", () => {
  assert.equal(isTripSettingsDraftDirty(savedDraft, {
    ...copyDraft(),
    countriesList: ["AT", "HU", "CZ"],
  }), true)
  assert.equal(isTripSettingsDraftDirty(savedDraft, {
    ...copyDraft(),
    countriesList: ["AT", "CZ"],
  }), true)
})

test("daily destination changes and length participate in dirty detection", () => {
  assert.equal(isTripSettingsDraftDirty(savedDraft, {
    ...copyDraft(),
    dailyCountries: ["AT", "CZ", "CZ", "HU"],
  }), true)
  assert.equal(isTripSettingsDraftDirty(savedDraft, {
    ...copyDraft(),
    dailyCountries: ["AT", "AT", "CZ"],
  }), true)
})
