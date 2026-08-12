import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

import {
  EMAIL_INVITE_ROLES,
  parseEmailInviteRole,
} from "../src/lib/email-invite.ts"

const inviteRouteSource = readFileSync(
  new URL("../src/app/api/trips/[tripId]/invite-email/route.ts", import.meta.url),
  "utf8",
)
const tripClientSource = readFileSync(
  new URL("../src/app/trips/[tripId]/trip-detail-client.tsx", import.meta.url),
  "utf8",
)
const settingsSource = readFileSync(
  new URL("../src/app/trips/[tripId]/settings/page.tsx", import.meta.url),
  "utf8",
)
const acceptRouteSource = readFileSync(
  new URL("../src/app/api/invite/accept/route.ts", import.meta.url),
  "utf8",
)

test("email invitations accept only member and viewer roles", () => {
  assert.deepEqual(EMAIL_INVITE_ROLES, ["member", "viewer"])
  assert.equal(parseEmailInviteRole(undefined), "member")
  assert.equal(parseEmailInviteRole("member"), "member")
  assert.equal(parseEmailInviteRole("viewer"), "viewer")
  assert.equal(parseEmailInviteRole("owner"), null)
  assert.equal(parseEmailInviteRole(null), null)
  assert.equal(parseEmailInviteRole(""), null)
})

test("both email invite forms send the selected role", () => {
  assert.match(tripClientSource, /JSON\.stringify\(\{ email: fullEmail, role: inviteRole \}\)/u)
  assert.match(settingsSource, /JSON\.stringify\(\{ email: inviteEmail\.trim\(\), role: emailInviteRole \}\)/u)
  assert.match(tripClientSource, /<EmailInviteRoleSelector/u)
  assert.match(settingsSource, /<EmailInviteRoleSelector/u)
})

test("resending refreshes the pending invite role and expiry", () => {
  assert.match(inviteRouteSource, /parseEmailInviteRole\(body\.role\)/u)
  assert.match(inviteRouteSource, /data:\s*\{\s*role,\s*invitedBy: session\.user\.id,\s*expires,/u)
  assert.match(inviteRouteSource, /token,\s*role,\s*invitedBy: session\.user\.id,/u)
  assert.match(acceptRouteSource, /const role = parseEmailInviteRole\(invite\.role\)/u)
  assert.match(acceptRouteSource, /userId: session\.user\.id,\s*role,/u)
  assert.doesNotMatch(acceptRouteSource, /role: invite\.role/u)
})
