import assert from "node:assert/strict"
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import test from "node:test"
import manifest from "../src/app/manifest.ts"

const expectedIcons = [
  {
    src: "/images/pwa/icon-192-v2.png",
    sizes: "192x192",
    type: "image/png",
    purpose: "any",
  },
  {
    src: "/images/pwa/icon-512-v2.png",
    sizes: "512x512",
    type: "image/png",
    purpose: "any",
  },
  {
    src: "/images/pwa/icon-maskable-512-v2.png",
    sizes: "512x512",
    type: "image/png",
    purpose: "maskable",
  },
] as const

function readPngDimensions(path: string) {
  const image = readFileSync(path)
  assert.deepEqual(
    image.subarray(0, 8),
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  )
  return {
    width: image.readUInt32BE(16),
    height: image.readUInt32BE(20),
  }
}

test("PWA manifest exposes standalone install metadata and required icons", () => {
  const value = manifest()
  const icons = value.icons || []

  assert.equal(value.id, "/")
  assert.equal(value.start_url, "/")
  assert.equal(value.scope, "/")
  assert.equal(value.display, "standalone")
  assert.deepEqual(icons, expectedIcons)

  for (const expected of expectedIcons) {
    const assetPath = join(process.cwd(), "public", expected.src.slice(1))
    const edge = Number.parseInt(expected.sizes, 10)
    assert.ok(existsSync(assetPath))
    assert.deepEqual(readPngDimensions(assetPath), { width: edge, height: edge })
  }
})

test("PWA airplane source and Apple metadata use the centered icon revision", () => {
  const sourceIcon = readFileSync(
    join(process.cwd(), "public/images/pwa/app-icon.svg"),
    "utf8",
  )
  const layoutSource = readFileSync(
    join(process.cwd(), "src/app/layout.tsx"),
    "utf8",
  )

  assert.match(sourceIcon, /transform="translate\(22 0\)"/)
  assert.match(layoutSource, /icon-192-v2\.png/)
  assert.match(layoutSource, /apple-touch-icon-v2\.png/)
  const appleIconPath = join(
    process.cwd(),
    "public/images/pwa/apple-touch-icon-v2.png",
  )
  assert.ok(existsSync(appleIconPath))
  assert.deepEqual(readPngDimensions(appleIconPath), { width: 180, height: 180 })
})
