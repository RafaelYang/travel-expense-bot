export const EMAIL_INVITE_ROLES = ["member", "viewer"] as const

export type EmailInviteRole = (typeof EMAIL_INVITE_ROLES)[number]

export function parseEmailInviteRole(value: unknown): EmailInviteRole | null {
  if (value === undefined) return "member"
  return EMAIL_INVITE_ROLES.find((role) => role === value) ?? null
}
