import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const cardSource = readFileSync(
  new URL("../src/components/exchange-rate-card.tsx", import.meta.url),
  "utf8",
)
const clientSource = readFileSync(
  new URL("../src/app/trips/[tripId]/trip-detail-client.tsx", import.meta.url),
  "utf8",
)
const globalCss = readFileSync(
  new URL("../src/app/globals.css", import.meta.url),
  "utf8",
)

function cssRule(selector: string) {
  const start = globalCss.indexOf(`${selector} {`)
  assert.notEqual(start, -1, `missing ${selector} CSS rule`)
  const end = globalCss.indexOf("}", start)
  assert.notEqual(end, -1, `unterminated ${selector} CSS rule`)
  return globalCss.slice(start, end)
}

test("exchange-rate card remounts only when the local day or automatic currency changes", () => {
  assert.match(clientSource, /resolveTripDayCurrency\(\{/u)
  assert.match(clientSource, /const exchangeRateCardKey = `\$\{currentCalendarDay\}:\$\{automaticRateCurrency\}`/u)
  assert.match(clientSource, /<ExchangeRateCard\s+key=\{exchangeRateCardKey\}/u)
  assert.match(cardSource, /const \[fromCurrency, setFromCurrency\] = useState\(initialForeignCurrency\)/u)
})

test("exchange-rate swap control is centered and unavailable without a complete pair", () => {
  const swapRule = cssRule(".exchange-rate-swap")
  assert.match(swapRule, /display:\s*grid;/u)
  assert.match(swapRule, /place-items:\s*center;/u)
  assert.match(swapRule, /justify-self:\s*center;/u)
  assert.match(swapRule, /padding:\s*0;/u)
  assert.match(cssRule(".exchange-rate-swap svg"), /display:\s*block;/u)
  assert.match(cardSource, /role="group" aria-label=\{t\("trip\.rate\.pair"\)\}/u)
  assert.match(cardSource, /disabled=\{!fromCurrency \|\| !toCurrency\}/u)
})
