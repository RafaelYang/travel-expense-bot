import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const clientSource = readFileSync(
  new URL("../src/app/trips/[tripId]/trip-detail-client.tsx", import.meta.url),
  "utf8",
)
const pageSource = readFileSync(
  new URL("../src/app/trips/[tripId]/page.tsx", import.meta.url),
  "utf8",
)
const routeSource = readFileSync(
  new URL("../src/app/api/trips/[tripId]/route.ts", import.meta.url),
  "utf8",
)

test("trip timeline shows every transaction by default and remembers the viewed trip", () => {
  assert.match(clientSource, /const \[showAllExpenses, setShowAllExpenses\] = useState\(true\)/u)
  assert.match(clientSource, /LAST_VIEWED_TRIP_COOKIE/u)
  assert.match(clientSource, /document\.cookie = \[/u)
})

test("trip detail loaders omit Base64 image bodies and sign references from counts", () => {
  for (const source of [pageSource, routeSource]) {
    assert.match(source, /omit: \{ images: true \}/u)
    assert.match(source, /getExpenseImageCounts\(tripId, session\.user\.id\)/u)
    assert.match(source, /createSignedExpenseImagePathsFromCount/u)
  }
})
