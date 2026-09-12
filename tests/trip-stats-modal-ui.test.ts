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

test("fee and reward view avoids duplicate figures and collapses the fund summary", () => {
  assert.match(modalSource, /trip\.stats\.adjustmentResult\.saved/u)
  assert.doesNotMatch(modalSource, /trip\.stats\.(?:adjustmentCount|totalRewards|netAdjustment)/u)
  assert.doesNotMatch(modalSource, /styles\.adjustmentSummary/u)
  assert.match(
    modalSource,
    /<details className=\{styles\.fundSummary\}>[\s\S]*?<summary className=\{styles\.fundSummaryToggle\}>/u,
  )
  assert.match(
    modalStyles,
    /\.fundSummary\[open\] \.fundSummaryToggle svg \{[\s\S]*?transform: rotate\(90deg\);/u,
  )
})

test("trip fund hero shows a balanced final-cost formula", () => {
  assert.match(modalSource, /trip\.totalDeposits > 0/u)
  assert.match(modalSource, /getTripFinalCostBreakdown\([\s\S]*?trip\.totalSpent,[\s\S]*?trip\.totalDeposits,[\s\S]*?statistics\.adjustmentSummary\.totalRewards/u)
  assert.match(modalSource, /trip\.stats\.costFormula\.current/u)
  assert.match(modalSource, /trip\.stats\.costFormula\.final/u)
  assert.match(i18nSource, /'trip\.stats\.costFormula\.current': '目前總花費（回饋前）'/u)
})

test("daily chart starts without details and toggles the selected day off", () => {
  assert.match(modalSource, /const \[selectedDayKey, setSelectedDayKey\] = useState<string \| null>\(null\)/u)
  assert.match(modalSource, /const selectedPoint = statistics\.dailyFundFlow\.find\(\(point\) => point\.dayKey === selectedDayKey\)/u)
  assert.doesNotMatch(modalSource, /selectedPoint[\s\S]{0,100}\?\? statistics\.dailyFundFlow/u)
  assert.match(modalSource, /currentDayKey === point\.dayKey \? null : point\.dayKey/u)
  assert.match(modalSource, /\{selectedPoint && \([\s\S]*?styles\.selectedDay/u)
})
