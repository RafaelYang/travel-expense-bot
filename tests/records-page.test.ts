import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const pageSource = readFileSync(
  new URL("../src/app/trips/[tripId]/records/page.tsx", import.meta.url),
  "utf8",
)
const recordsClientSource = readFileSync(
  new URL("../src/app/trips/[tripId]/records/records-client.tsx", import.meta.url),
  "utf8",
)
const tripClientSource = readFileSync(
  new URL("../src/app/trips/[tripId]/trip-detail-client.tsx", import.meta.url),
  "utf8",
)
const statsSource = readFileSync(
  new URL("../src/components/trip-stats-modal.tsx", import.meta.url),
  "utf8",
)

test("records page authorizes through trip membership before loading transaction metadata", () => {
  assert.match(pageSource, /const session = await auth\(\)/u)
  assert.match(pageSource, /if \(!session\?\.user\?\.id\) redirect\("\/login"\)/u)
  assert.match(pageSource, /const \{ tripId \} = await params/u)
  assert.match(pageSource, /members:\s*\{ some:\s*\{ userId: session\.user\.id \} \}/u)
  assert.match(pageSource, /if \(!trip \|\| !trip\.members\[0\]\) redirect\("\/"\)/u)
  assert.doesNotMatch(pageSource, /images:\s*true/u)
})

test("records page centralizes recorder and reconciliation status with useful filters", () => {
  assert.match(recordsClientSource, /type RecordsFilter = "all" \| "pending" \| "confirmed" \| "not-required"/u)
  assert.match(recordsClientSource, /trip\.records\.recorder/u)
  assert.match(recordsClientSource, /trip\.records\.status/u)
  assert.match(recordsClientSource, /<BatchReconcileModal/u)
  assert.match(tripClientSource, /href=\{`\/trips\/\$\{tripId\}\/records`\}/u)
})

test("trip list and statistics views no longer repeat recorder or reconciliation status", () => {
  assert.doesNotMatch(tripClientSource, /className="transaction-list-status"/u)
  assert.doesNotMatch(statsSource, /expense\.detail\.recordedBy/u)
  assert.doesNotMatch(statsSource, /expense\.detail\.source/u)
  assert.doesNotMatch(statsSource, /expense\.reconcile\.status/u)
  assert.doesNotMatch(statsSource, /styles\.confirmedBadge|styles\.pendingBadge/u)
})
