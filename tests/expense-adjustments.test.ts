import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

function source(path: string) {
  return readFileSync(new URL(path, import.meta.url), "utf8")
}

const schemaSource = source("../prisma/schema.prisma")
const createRouteSource = source("../src/app/api/trips/[tripId]/expenses/route.ts")
const updateRouteSource = source("../src/app/api/trips/[tripId]/expenses/[expenseId]/route.ts")
const tripClientSource = source("../src/app/trips/[tripId]/trip-detail-client.tsx")
const newTripSource = source("../src/app/trips/new/page.tsx")
const settingsSource = source("../src/app/trips/[tripId]/settings/page.tsx")
const optionSelectorSource = source("../src/components/expense-adjustment-option-selector.tsx")
const recordsPageSource = source("../src/app/trips/[tripId]/records/page.tsx")
const recordsClientSource = source("../src/app/trips/[tripId]/records/records-client.tsx")
const batchSource = source("../src/components/batch-reconcile-modal.tsx")
const statsModalSource = source("../src/components/trip-stats-modal.tsx")
const statisticsSource = source("../src/lib/trip-statistics.ts")
const i18nSource = source("../src/lib/i18n.ts")
const globalsSource = source("../src/app/globals.css")

test("trip and expense schemas persist independent adjustment options and three base-currency values", () => {
  assert.match(schemaSource, /expenseAdjustmentsEnabled Boolean @default\(false\)/u)
  assert.match(schemaSource, /serviceFeeEnabled\s+Boolean @default\(false\)/u)
  assert.match(schemaSource, /shopbackRewardEnabled\s+Boolean @default\(false\)/u)
  assert.match(schemaSource, /creditCardRewardEnabled\s+Boolean @default\(false\)/u)
  assert.match(schemaSource, /serviceFee\s+Float\s+@default\(0\)/u)
  assert.match(schemaSource, /shopbackReward\s+Float\s+@default\(0\)/u)
  assert.match(schemaSource, /creditCardReward\s+Float\s+@default\(0\)/u)
})

test("expense APIs validate non-negative finite adjustments and guard each trip setting", () => {
  for (const routeSource of [createRouteSource, updateRouteSource]) {
    for (const field of ["serviceFee", "shopbackReward", "creditCardReward"]) {
      assert.match(routeSource, new RegExp(`${field}: z\\.number\\(\\)\\.nonnegative\\(\\)\\.finite\\(\\)`))
    }
    for (const option of ["serviceFeeEnabled", "shopbackRewardEnabled", "creditCardRewardEnabled"]) {
      assert.match(routeSource, new RegExp(option))
    }
  }
  assert.match(createRouteSource, /data\.serviceFee > 0 && !trip\?\.serviceFeeEnabled/u)
  assert.match(updateRouteSource, /data\.serviceFee !== undefined && !adjustmentOptions\?\.serviceFeeEnabled/u)
})

test("new and existing trips show three separate option cards without hint copy", () => {
  for (const option of ["serviceFeeEnabled", "shopbackRewardEnabled", "creditCardRewardEnabled"]) {
    assert.match(newTripSource, new RegExp(`${option}: false`))
    assert.match(settingsSource, new RegExp(`${option}: false`))
    assert.match(optionSelectorSource, new RegExp(`\\[\"${option}\"`))
  }
  assert.match(newTripSource, /<ExpenseAdjustmentOptionSelector/u)
  assert.match(settingsSource, /<ExpenseAdjustmentOptionSelector/u)
  assert.doesNotMatch(optionSelectorSource, /hint|<small|<p/u)
  assert.match(tripClientSource, /hasAnyExpenseAdjustmentOption\(adjustmentOptions\)/u)
})

test("create, edit, records, and batch reconciliation all expose the three numeric fields", () => {
  assert.match(tripClientSource, /function ExpenseAdjustmentFields/u)
  assert.match(tripClientSource, /type="number"[\s\S]*inputMode="decimal"[\s\S]*step="any"/u)
  assert.match(tripClientSource, /serviceFee: data\.serviceFee \?\? 0/u)
  for (const field of ["serviceFee", "shopbackReward", "creditCardReward"]) {
    assert.match(recordsPageSource, new RegExp(`${field}: true`))
    assert.match(recordsClientSource, new RegExp(`${field}: number`))
    assert.match(batchSource, new RegExp(`${field}: parseAdjustment`))
  }
  assert.match(recordsClientSource, /getExpenseBaseAmount\(expense, initialTrip\.baseCurrency\)/u)
})

test("desktop expense detail and editing use a wide grouped layout without changing mobile", () => {
  assert.match(tripClientSource, /trip-modal expense-detail-modal/u)
  assert.match(tripClientSource, /expense-detail-content/u)
  assert.match(tripClientSource, /expense-editor-content/u)
  assert.match(tripClientSource, /expense-editor-panel expense-editor-overview/u)
  assert.match(tripClientSource, /expense-editor-lower-grid/u)
  assert.match(tripClientSource, /expense-editor-panel expense-editor-meta/u)
  assert.match(
    globalsSource,
    /@media \(min-width: 768px\)[\s\S]*\.trip-modal\.expense-detail-modal \{\s*max-width: 980px !important;[\s\S]*max-height: calc\(100dvh - 5rem\) !important;/u,
  )
  assert.match(
    globalsSource,
    /\.expense-detail-modal \.expense-detail-content \{[\s\S]*grid-template-columns:[\s\S]*overflow-y: auto !important;/u,
  )
  assert.match(
    globalsSource,
    /\.expense-detail-modal \.expense-editor-content \{[\s\S]*display: flex;[\s\S]*overflow-y: auto !important;/u,
  )
  assert.match(
    globalsSource,
    /\.expense-editor-lower-grid \{[\s\S]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);/u,
  )
  assert.match(
    tripClientSource,
    /expense-editor-classification-row[\s\S]*expense-editor-categories[\s\S]*expense-editor-currency-field[\s\S]*expense-editor-overview-grid/u,
  )
  assert.match(
    globalsSource,
    /\.expense-editor-classification-row \{[\s\S]*grid-template-columns: minmax\(0, 1fr\) auto;/u,
  )
  assert.match(
    tripClientSource,
    /expense-editor-image-strip[\s\S]*expense-editor-image-preview[\s\S]*expense-editor-image-thumbnail[\s\S]*expense-editor-image-add/u,
  )
  assert.match(
    globalsSource,
    /\.expense-editor-image-strip \{[\s\S]*grid-template-columns: repeat\(3, minmax\(0, 1fr\)\);[\s\S]*\.expense-editor-image-preview,[\s\S]*aspect-ratio: 4 \/ 3;/u,
  )
  assert.doesNotMatch(
    globalsSource.slice(0, globalsSource.indexOf("@media (min-width: 768px)")),
    /\.expense-detail-modal \.expense-(?:detail|editor)-(?:content|gallery)/u,
  )
})

test("expense editing ignores backdrop clicks and supports Enter-to-save through the form guard", () => {
  assert.match(
    tripClientSource,
    /if \(!isBusy && mode === 'view'\) onClose\(\)/u,
  )
  assert.match(
    tripClientSource,
    /const canSave = !saving[\s\S]*&& reconciliationIsValid/u,
  )
  assert.match(
    tripClientSource,
    /<form[\s\S]*className="trip-modal-scroll-area expense-editor-content"[\s\S]*onSubmit=\{\(event\) => \{[\s\S]*event\.preventDefault\(\)[\s\S]*if \(!canSave\) return[\s\S]*void handleSave\(\)[\s\S]*<button[\s\S]*type="submit"[\s\S]*disabled=\{!canSave\}[\s\S]*儲存修改[\s\S]*<\/form>/u,
  )
  assert.match(
    tripClientSource,
    /<button\s+type="button"\s+onClick=\{handleDelete\}/u,
  )
})

test("statistics expose a scoped fee and reward analysis without merging it into categories", () => {
  assert.match(statisticsSource, /adjustmentSummary: summarizeExpenseAdjustments\(scopedExpenses\)/u)
  assert.match(statsModalSource, /type StatsTab = "daily" \| "categories" \| "adjustments"/u)
  assert.match(statsModalSource, /trip\.stats\.tab\.adjustments/u)
  assert.match(statsModalSource, /statistics\.adjustmentSummary\.totalRewards/u)
  assert.match(statsModalSource, /statistics\.adjustmentSummary\.netAdjustment/u)
  assert.match(i18nSource, /'trip\.stats\.adjustmentsTitle': '服務費與回饋分析'/u)
})
