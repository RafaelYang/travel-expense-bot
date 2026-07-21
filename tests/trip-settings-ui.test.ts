import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const settingsSource = readFileSync(
  new URL("../src/app/trips/[tripId]/settings/page.tsx", import.meta.url),
  "utf8",
)
const navbarSource = readFileSync(
  new URL("../src/components/navbar.tsx", import.meta.url),
  "utf8",
)
const i18nSource = readFileSync(
  new URL("../src/lib/i18n.ts", import.meta.url),
  "utf8",
)

function sourceSection(source: string, startMarker: string, endMarker: string) {
  const start = source.indexOf(startMarker)
  const end = source.indexOf(endMarker, start + startMarker.length)
  assert.notEqual(start, -1, `missing section start: ${startMarker}`)
  assert.notEqual(end, -1, `missing section end: ${endMarker}`)
  return source.slice(start, end)
}

test("saving settings redirects only after a successful response", () => {
  const saveSection = sourceSection(
    settingsSource,
    "const saveSettings = async () =>",
    "const deleteTrip = async () =>",
  )
  const request = saveSection.indexOf("const response = await fetch")
  const failureGuard = saveSection.indexOf("if (!response.ok)")
  const bypass = saveSection.indexOf("allowNavigation()")
  const redirect = saveSection.indexOf("router.replace(`/trips/${tripId}`)")

  assert.ok(request >= 0)
  assert.ok(failureGuard > request)
  assert.ok(bypass > failureGuard)
  assert.ok(redirect > bypass)
  assert.doesNotMatch(saveSection, /fetchTrip\(\)/)
  assert.match(settingsSource, /disabled=\{saving \|\| uploadingImage\}/)
})

test("dirty settings warn on in-app navigation and browser unload", () => {
  assert.match(settingsSource, /isTripSettingsDraftDirty\(savedDraft, currentDraft\)/)
  assert.match(settingsSource, /window\.addEventListener\("beforeunload", handleBeforeUnload\)/)
  assert.match(settingsSource, /window\.removeEventListener\("beforeunload", handleBeforeUnload\)/)
  assert.match(settingsSource, /event\.preventDefault\(\)/)
  assert.match(settingsSource, /event\.returnValue = ""/)
  assert.match(settingsSource, /navigation\.addEventListener\("navigate", handleNavigate\)/)
  assert.match(settingsSource, /navigation\.removeEventListener\("navigate", handleNavigate\)/)
  assert.match(settingsSource, /navigateEvent\.navigationType !== "traverse"/)
  assert.match(settingsSource, /!navigateEvent\.cancelable/)
  assert.match(settingsSource, /"NavigationPrecommitController" in window/)
  assert.match(settingsSource, /precommitHandler: async \(\) =>/)
  assert.match(settingsSource, /if \(!confirmNavigation\(\)\) navigateEvent\.preventDefault\(\)/)
  assert.doesNotMatch(settingsSource, /traverseTo\(/)
  assert.match(settingsSource, /onNavigate=\{\(event\) =>/)
  assert.match(settingsSource, /<Navbar onBeforeNavigate=\{confirmNavigation\}/)
  assert.match(settingsSource, /role="status" aria-live="polite"/)

  assert.match(navbarSource, /onBeforeNavigate\?: \(\) => boolean/)
  assert.equal(navbarSource.split("onBeforeNavigate?.() === false").length - 1, 4)

  assert.equal(i18nSource.split("'settings.unsaved.notice'").length - 1, 2)
  assert.equal(i18nSource.split("'settings.unsaved.confirm'").length - 1, 2)
})

test("settings controls are locked while a save request is in flight", () => {
  assert.match(settingsSource, /<fieldset disabled=\{saving\}/)
  assert.match(settingsSource, /disabled=\{saving \|\| uploadingImage\}/)
  assert.match(settingsSource, /const shouldBlockNavigation = hasUnsavedChanges \|\| saving/)
  assert.match(settingsSource, /if \(saving\) \{/)
  assert.equal(i18nSource.split("'settings.save.inProgress'").length - 1, 2)
})

test("member removal preserves an in-progress settings draft", () => {
  const removeSection = sourceSection(
    settingsSource,
    "const removeMember = async",
    "if (loading || !trip)",
  )
  assert.doesNotMatch(removeSection, /fetchTrip\(\)/)
  assert.match(removeSection, /members: current\.members\.filter/)
})
