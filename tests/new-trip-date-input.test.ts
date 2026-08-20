import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const pageSource = readFileSync(
  new URL("../src/app/trips/new/page.tsx", import.meta.url),
  "utf8",
)
const globalCss = readFileSync(
  new URL("../src/app/globals.css", import.meta.url),
  "utf8",
)

test("new-trip dates are native date inputs before the first mobile tap", () => {
  assert.equal(pageSource.match(/type="date"/gu)?.length, 2)
  assert.doesNotMatch(pageSource, /e\.target\.type = "date"/u)
  assert.doesNotMatch(pageSource, /type=\{form\.(?:startDate|endDate)/u)
})

test("new-trip date constraints keep the end date on or after the start date", () => {
  assert.match(pageSource, /max=\{form\.endDate \|\| undefined\}/u)
  assert.match(pageSource, /min=\{form\.startDate \|\| undefined\}/u)
})

test("mobile new-trip dates stack with full-width touch targets", () => {
  assert.match(
    globalCss,
    /@media \(max-width: 600px\)[\s\S]*?\.new-trip-date-grid\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\);/u,
  )
  assert.match(
    globalCss,
    /@media \(max-width: 600px\)[\s\S]*?\.new-trip-date-field \.date-input\s*\{[\s\S]*?min-height:\s*48px;/u,
  )
})
