import assert from "node:assert/strict"
import test from "node:test"

import { getCashExchangeWalletDelta } from "../src/lib/cash-exchange.ts"

test("editing a buy exchange applies the foreign amount difference to the wallet", () => {
  assert.equal(getCashExchangeWalletDelta("buy", 100, 150), 50)
  assert.equal(getCashExchangeWalletDelta("buy", 150, 100), -50)
})

test("editing a sell exchange applies the inverse foreign amount difference", () => {
  assert.equal(getCashExchangeWalletDelta("sell", 100, 150), -50)
  assert.equal(getCashExchangeWalletDelta("sell", 150, 100), 50)
})
