import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

import {
  createTripCompletionSubject,
  formatTripCompletionDateRange,
  generateTripCompletionEmailHtml,
  normalizeTripCompletionRecipients,
} from "../src/lib/trip-completion-email.ts"

const routeSource = readFileSync(
  new URL("../src/app/api/trips/[tripId]/completion-email/route.ts", import.meta.url),
  "utf8",
)
const settingsSource = readFileSync(
  new URL("../src/app/trips/[tripId]/settings/page.tsx", import.meta.url),
  "utf8",
)
const i18nSource = readFileSync(
  new URL("../src/lib/i18n.ts", import.meta.url),
  "utf8",
)

test("completion recipients are normalized, deduplicated, and invalid addresses are skipped", () => {
  assert.deepEqual(normalizeTripCompletionRecipients([
    " Owner@Example.com ",
    "owner@example.com",
    "member@example.com",
    "not-an-email",
    "",
  ]), ["owner@example.com", "member@example.com"])
})

test("completion email safely renders trip details and keeps the trip editable", () => {
  const html = generateTripCompletionEmailHtml({
    tripName: "澳洲 <十日遊>",
    senderName: "Rafael & Friends",
    dateRange: "2026/8/18－2026/8/27",
    tripUrl: "https://example.com/trips/abc?from=mail&ready=1",
  })

  assert.match(html, /澳洲 &lt;十日遊&gt;/u)
  assert.match(html, /Rafael &amp; Friends/u)
  assert.match(html, /from=mail&amp;ready=1/u)
  assert.match(html, /不會鎖定行程/u)
  assert.equal(
    formatTripCompletionDateRange(
      new Date("2026-08-18T00:00:00.000Z"),
      new Date("2026-08-27T00:00:00.000Z"),
    ),
    "2026/8/18－2026/8/27",
  )
  assert.equal(
    createTripCompletionSubject("測試\r\nBcc: attacker@example.com"),
    "「測試 Bcc: attacker@example.com」行程資料已整理完成",
  )
})

test("completion route is owner-authorized and sends a private email to every current member", () => {
  assert.match(routeSource, /userId: session\.user\.id,\s*role: "owner"/u)
  assert.match(routeSource, /trip\.members\.map\(\(member\) => member\.user\.email\)/u)
  assert.match(routeSource, /Promise\.allSettled/u)
  assert.match(routeSource, /recipients\.map\(\(email\) => transporter\.sendMail/u)
  assert.match(routeSource, /to: email/u)
  assert.doesNotMatch(routeSource, /bcc:/u)
  assert.match(routeSource, /sentCount/u)
  assert.match(routeSource, /failedCount/u)
})

test("settings require saved changes and confirmation before sending completion mail", () => {
  assert.match(settingsSource, /trip\.userRole === 'owner'/u)
  assert.match(settingsSource, /window\.confirm\(t\('settings\.completion\.confirm'/u)
  assert.match(settingsSource, /fetch\(`\/api\/trips\/\$\{tripId\}\/completion-email`/u)
  assert.match(settingsSource, /disabled=\{completionSending \|\| hasUnsavedChanges \|\| saving\}/u)
  assert.match(settingsSource, /settings\.completion\.saveFirst/u)
  assert.equal(i18nSource.split("'settings.completion.send'").length - 1, 2)
  assert.equal(i18nSource.split("'settings.completion.sent'").length - 1, 2)
})
