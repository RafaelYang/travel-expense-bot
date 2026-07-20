import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const clientSource = readFileSync(
  new URL("../src/app/trips/[tripId]/trip-detail-client.tsx", import.meta.url),
  "utf8",
)

test("timeline reorder uses a synchronous mutex and releases it in finally", () => {
  assert.match(clientSource, /const reorderingTimelineRef = useRef\(false\)/u)
  assert.match(clientSource, /if \(reorderingTimelineRef\.current \|\| activeKey === overKey\) return/u)
  assert.match(clientSource, /reorderingTimelineRef\.current = true[\s\S]*?await fetch\(`/u)
  assert.match(clientSource, /finally \{\s*reorderingTimelineRef\.current = false/u)
})

test("timeline reorder sends its browser time zone and refreshes full trip data after success", () => {
  assert.match(clientSource, /JSON\.stringify\(\{ activeKey, overKey, dateKey, timeZone: timelineTimeZone \}\)/u)
  assert.match(clientSource, /if \(!response\.ok \|\| !data\?\.timelineOrder\)[\s\S]*?setTrip\([\s\S]*?await fetchTrip\(false\)/u)
  assert.doesNotMatch(
    clientSource.slice(clientSource.indexOf("const moveTransaction"), clientSource.indexOf("// 依日期分組")),
    /syncRealtimeBaseline/u,
  )
})
