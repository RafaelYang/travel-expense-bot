import assert from "node:assert/strict"
import test from "node:test"

import {
  createSignedExpenseImagePath,
  createSignedExpenseImagePaths,
  resolveExpenseImageInputs,
  signExpenseImageAccess,
  verifyExpenseImageAccess,
} from "../src/lib/expense-image-signing.ts"

const secret = "test-only-signing-secret"

test("accepts an unexpired signature for the exact expense and index", () => {
  const expires = 2_000
  const signature = signExpenseImageAccess("expense-1", 0, expires, secret)

  assert.equal(
    verifyExpenseImageAccess("expense-1", 0, expires, signature, 1_000, secret),
    true,
  )
})

test("rejects expired, tampered, or cross-expense signatures", () => {
  const expires = 2_000
  const signature = signExpenseImageAccess("expense-1", 0, expires, secret)

  assert.equal(
    verifyExpenseImageAccess("expense-1", 0, expires, signature, 2_001, secret),
    false,
  )
  assert.equal(
    verifyExpenseImageAccess("expense-2", 0, expires, signature, 1_000, secret),
    false,
  )
  assert.equal(
    verifyExpenseImageAccess("expense-1", 1, expires, signature, 1_000, secret),
    false,
  )
})

test("serializes stored images as signed references instead of Base64 payloads", () => {
  const paths = createSignedExpenseImagePaths(
    "expense-1",
    ["data:image/jpeg;base64,QUJD", "https://example.com/receipt.jpg"],
    60,
    secret,
  )

  assert.equal(paths.length, 2)
  assert.equal(paths.every((path) => path.startsWith("/api/trips/expenses/images/expense-1?")), true)
  assert.equal(paths.some((path) => path.includes("QUJD")), false)
})

test("resolves valid existing image references without persisting expiring URLs", () => {
  const now = Math.floor(Date.now() / 1000)
  const existing = ["data:image/jpeg;base64,QUJD", "https://example.com/receipt.jpg"]
  const firstReference = createSignedExpenseImagePath("expense-1", 0, 60, secret)
  const resolved = resolveExpenseImageInputs(
    "expense-1",
    existing,
    [firstReference, "data:image/png;base64,REVG"],
    now,
    secret,
  )

  assert.deepEqual(resolved, [existing[0], "data:image/png;base64,REVG"])
})

test("rejects tampered or cross-expense image references", () => {
  const reference = createSignedExpenseImagePath("expense-1", 0, 60, secret)

  assert.equal(
    resolveExpenseImageInputs("expense-2", ["data:image/jpeg;base64,QUJD"], [reference], undefined, secret),
    null,
  )
})
