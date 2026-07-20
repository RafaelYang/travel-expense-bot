import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const routeSource = readFileSync(
  new URL("../src/app/api/trips/[tripId]/timeline-order/route.ts", import.meta.url),
  "utf8",
)

test("timeline reorder route binds the user to a writable trip membership", () => {
  assert.match(routeSource, /const session = await auth\(\)/u)
  assert.match(routeSource, /tripId_userId:\s*\{\s*tripId,\s*userId\s*\}/u)
  assert.match(routeSource, /WRITABLE_TRIP_ROLES\.some/u)
  assert.match(routeSource, /members:\s*\{\s*some:\s*\{\s*userId,/u)
  assert.match(routeSource, /role:\s*\{\s*in:\s*\[\.\.\.WRITABLE_TRIP_ROLES\]/u)
})

test("timeline reorder route validates authoritative trip rows and calendar day", () => {
  assert.match(routeSource, /expenses:\s*\{\s*select:\s*\{\s*id:\s*true,\s*date:\s*true,\s*createdAt:\s*true/u)
  assert.match(routeSource, /deposits:\s*\{\s*select:\s*\{\s*id:\s*true,\s*date:\s*true,\s*createdAt:\s*true/u)
  assert.match(routeSource, /cashExchanges:\s*\{\s*select:\s*\{\s*id:\s*true,\s*date:\s*true,\s*createdAt:\s*true/u)
  assert.match(routeSource, /timelineItemDateKey\(active, timeZone\)/u)
  assert.match(routeSource, /timelineItemDateKey\(over, timeZone\)/u)
  assert.match(routeSource, /moveTimelineItem\(/u)
})

test("timeline reorder route resolves the current browser time zone before fallbacks", () => {
  assert.match(routeSource, /timeZone:\s*z\.string\(\)\.trim\(\)\.min\(1\)\.max\(100\)/u)
  assert.match(routeSource, /resolveCalendarTimeZone\(\s*parsedBody\.data\.timeZone,/u)
  assert.match(routeSource, /request\.cookies\.get\(VISITOR_TIME_ZONE_COOKIE\)/u)
  assert.match(routeSource, /request\.headers\.get\("x-vercel-ip-timezone"\)/u)
})

test("timeline reorder route rejects a stale whole-order write", () => {
  assert.match(routeSource, /transaction\.trip\.updateMany\(/u)
  assert.match(routeSource, /updatedAt:\s*member\.trip\.updatedAt/u)
  assert.match(routeSource, /if \(result\.count !== 1\) return null/u)
  assert.match(routeSource, /if \(!updated\)[\s\S]*?409/u)
})
