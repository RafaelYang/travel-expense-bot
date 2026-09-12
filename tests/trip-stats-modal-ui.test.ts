import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const modalSource = readFileSync(
  new URL("../src/components/trip-stats-modal.tsx", import.meta.url),
  "utf8",
)
const modalStyles = readFileSync(
  new URL("../src/components/trip-stats-modal.module.css", import.meta.url),
  "utf8",
)
const i18nSource = readFileSync(
  new URL("../src/lib/i18n.ts", import.meta.url),
  "utf8",
)

test("trip statistics always use every record without a date-range selector", () => {
  assert.match(modalSource, /scope: "all"/u)
  assert.match(modalSource, /t\("trip\.stats\.scope\.all"\)/u)
  assert.doesNotMatch(modalSource, /defaultStatisticsScope|setScope|styles\.scopeGroup/u)
  assert.doesNotMatch(modalSource, /trip\.stats\.scope\.(?:pretrip|trip)/u)
  assert.doesNotMatch(i18nSource, /依目前日期範圍/u)
})

test("desktop statistics use a wider and taller dialog while mobile remains full screen", () => {
  assert.match(
    modalStyles,
    /@media \(min-width: 768px\) \{[\s\S]*?\.modal \{[\s\S]*?width: min\(1180px, calc\(100vw - 3rem\)\);[\s\S]*?max-height: min\(94dvh, 1040px\);/u,
  )
  assert.match(
    modalStyles,
    /@media \(max-width: 640px\) \{[\s\S]*?\.modal \{[\s\S]*?width: 100vw;[\s\S]*?height: 100dvh;[\s\S]*?max-height: none;/u,
  )
})
