import assert from "node:assert/strict"
import test from "node:test"
import manifest from "../src/app/manifest.ts"

test("PWA manifest exposes standalone install metadata and required icons", () => {
  const value = manifest()
  const icons = value.icons || []

  assert.equal(value.id, "/")
  assert.equal(value.start_url, "/")
  assert.equal(value.scope, "/")
  assert.equal(value.display, "standalone")
  assert.ok(icons.some((icon) => icon.sizes === "192x192" && icon.purpose === "any"))
  assert.ok(icons.some((icon) => icon.sizes === "512x512" && icon.purpose === "any"))
  assert.ok(icons.some((icon) => icon.sizes === "512x512" && icon.purpose === "maskable"))
})
