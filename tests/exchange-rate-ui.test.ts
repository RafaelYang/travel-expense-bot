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

test("mobile exchange rate stays out of the transaction flow and opens as a calculator", () => {
  const triggerRule = cssRule(".exchange-rate-mobile-trigger")
  assert.match(triggerRule, /position:\s*fixed;/u)
  assert.match(triggerRule, /left:\s*env\(safe-area-inset-left\);/u)
  assert.match(cardSource, /className="exchange-rate-mobile-trigger"/u)
  assert.match(cardSource, /<Dialog\.Content className="exchange-rate-mobile-dialog">/u)
  assert.match(cardSource, /className="exchange-rate-mobile-keypad"/u)
  assert.match(cardSource, /<ArrowLeft size=\{27\} aria-hidden="true" \/>/u)
  assert.doesNotMatch(cardSource, /<Delete\b/u)
  assert.match(
    globalCss,
    /@media \(max-width: 700px\)[\s\S]*?\.exchange-rate-card\s*\{\s*display:\s*none;/u,
  )
  assert.match(
    globalCss,
    /@media \(max-width: 700px\)[\s\S]*?\.exchange-rate-mobile-trigger\s*\{\s*display:\s*grid;/u,
  )
})

test("mobile calculator uses circular flag pickers and keeps history in a separate dialog", () => {
  const flagRule = cssRule(".exchange-rate-currency-flag")
  assert.match(flagRule, /width:\s*48px;/u)
  assert.match(flagRule, /height:\s*48px;/u)
  assert.match(flagRule, /border-radius:\s*50%;/u)
  assert.match(cardSource, /className="exchange-rate-currency-picker"/u)
  assert.match(cardSource, /currencyFlag\(value\)/u)
  assert.match(cardSource, /<select[\s\S]*?aria-label=\{ariaLabel\}/u)
  assert.match(cardSource, /t\("trip\.rate\.openHistory"\)/u)
  assert.match(cardSource, /<Dialog\.Content className="exchange-rate-history-dialog">/u)
  assert.doesNotMatch(cardSource, /className="exchange-rate-mobile-trend"/u)
})
