import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const componentSource = readFileSync(
  new URL("../src/components/sortable-transaction-list.tsx", import.meta.url),
  "utf8",
)

test("transaction sorting uses guarded mouse, long-touch, and keyboard sensors", () => {
  assert.match(componentSource, /useSensor\(MouseSensor,\s*\{ activationConstraint: \{ distance: 6 \} \}\)/u)
  assert.match(componentSource, /useSensor\(TouchSensor,\s*\{ activationConstraint: \{ delay: 400, tolerance: 8 \} \}\)/u)
  assert.match(componentSource, /useSensor\(KeyboardSensor,\s*\{/u)
  assert.match(componentSource, /start:\s*\[KeyboardCode\.Space\]/u)
  assert.match(componentSource, /cancel:\s*\[KeyboardCode\.Esc\]/u)
  assert.match(componentSource, /end:\s*\[KeyboardCode\.Space, KeyboardCode\.Tab\]/u)
  assert.doesNotMatch(componentSource, /start:\s*\[[^\]]*KeyboardCode\.Enter/u)
  assert.match(componentSource, /\[data-no-drag\]/u)
})

test("transaction sorting preserves page scrolling and suppresses the post-drag click", () => {
  assert.doesNotMatch(componentSource, /touchAction:\s*["']none["']/u)
  assert.match(componentSource, /onClickCapture/u)
  assert.match(componentSource, /event\.preventDefault\(\)/u)
  assert.match(componentSource, /event\.stopPropagation\(\)/u)
})

test("disabled sortable rows expose neither drag listeners nor draggable attributes", () => {
  assert.match(componentSource, /const guardedListeners = disabled \? \{\} :/u)
  assert.match(componentSource, /\.\.\.\(disabled \? \{\} : attributes\)/u)
})
