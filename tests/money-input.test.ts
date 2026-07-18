import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const tripDetailSource = readFileSync(
  new URL("../src/app/trips/[tripId]/trip-detail-client.tsx", import.meta.url),
  "utf8",
)

function inputContaining(marker: string) {
  const markerIndex = tripDetailSource.indexOf(marker)
  assert.notEqual(markerIndex, -1, `missing input marker: ${marker}`)

  const inputStart = tripDetailSource.lastIndexOf("<input", markerIndex)
  const inputEnd = tripDetailSource.indexOf("/>", markerIndex)
  assert.notEqual(inputStart, -1, `missing input start for: ${marker}`)
  assert.notEqual(inputEnd, -1, `missing input end for: ${marker}`)

  return tripDetailSource.slice(inputStart, inputEnd + 2)
}

test("expense and deposit amount fields allow decimal values", () => {
  const amountInputs = [
    inputContaining("placeholder={t('form.amount')}"),
    inputContaining('placeholder="金額"'),
    inputContaining('placeholder="輸入金額"'),
  ]

  for (const input of amountInputs) {
    assert.match(input, /type="number"/)
    assert.match(input, /inputMode="decimal"/)
    assert.match(input, /min="0"/)
    assert.match(input, /step="any"/)
  }
})
