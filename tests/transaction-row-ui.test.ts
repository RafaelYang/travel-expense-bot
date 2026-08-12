import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

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

test("transaction rows reserve a leading thumbnail and show the first signed expense image", () => {
  const thumbnailRule = cssRule(".transaction-list-thumbnail")
  assert.match(clientSource, /import Image from "next\/image"/u)
  assert.match(clientSource, /function TransactionThumbnail/u)
  assert.match(clientSource, /src=\{!isIncome \? expense\.images\?\.\[0\] : undefined\}/u)
  assert.match(clientSource, /sizes="\(max-width: 600px\) 68px, 64px"/u)
  assert.match(clientSource, /unoptimized/u)
  assert.match(clientSource, /onError=\{\(\) => setFailedSrc\(src\)\}/u)
  assert.match(thumbnailRule, /width:\s*64px;/u)
  assert.match(thumbnailRule, /height:\s*64px;/u)
  assert.match(thumbnailRule, /overflow:\s*hidden;/u)
})

test("mobile transaction layout keeps the thumbnail column aligned across row types", () => {
  assert.match(
    globalCss,
    /@media \(max-width: 600px\)[\s\S]*?grid-template-areas:\s*"thumbnail category amount"\s*"thumbnail title title"\s*"thumbnail meta meta";/u,
  )
  assert.match(
    globalCss,
    /@media \(max-width: 600px\)[\s\S]*?grid-template-columns:\s*68px minmax\(0, 1fr\) max-content;/u,
  )
  assert.match(
    globalCss,
    /@media \(max-width: 600px\)[\s\S]*?\.transaction-list-meta-wide\s*\{\s*grid-column:\s*2 \/ -1;/u,
  )
  assert.match(clientSource, /fallback=\{<ArrowRightLeft size=\{23\}/u)
  assert.match(clientSource, /<Wallet size=\{23\}/u)
  assert.match(clientSource, /<Receipt size=\{23\}/u)
  assert.match(
    globalCss,
    /@media \(max-width: 600px\)[\s\S]*?\.transaction-list-thumbnail\s*\{[\s\S]*?width:\s*68px;[\s\S]*?height:\s*68px;/u,
  )
  assert.match(
    globalCss,
    /@media \(max-width: 600px\)[\s\S]*?\.transaction-list-value\s*\{[\s\S]*?font-size:\s*1\.08rem;[\s\S]*?font-weight:\s*800;/u,
  )
})

test("normal transaction rows prioritize item and amount without recorder or reconciliation labels", () => {
  assert.match(clientSource, /href=\{`\/trips\/\$\{tripId\}\/records`\}/u)
  assert.doesNotMatch(clientSource, /className="transaction-list-status"/u)
  assert.doesNotMatch(clientSource, /\{expense\.user\?\.name\}/u)
  assert.doesNotMatch(clientSource, /\{exchange\.user\?\.name\}/u)
})

test("mobile day headers visually hide the daily-net label while preserving it for assistive technology", () => {
  assert.match(
    clientSource,
    /<span className="transaction-day-net-label">\s*\{t\('trip\.dailyNet'\)\}/u,
  )
  assert.match(
    globalCss,
    /@media \(max-width: 600px\)[\s\S]*?\.transaction-day-net-label\s*\{[\s\S]*?position:\s*absolute;[\s\S]*?clip:\s*rect\(0, 0, 0, 0\);/u,
  )
})
