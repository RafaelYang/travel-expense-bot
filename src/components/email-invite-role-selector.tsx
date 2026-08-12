"use client"

import { useLanguage } from "@/components/language-provider"
import { EMAIL_INVITE_ROLES, type EmailInviteRole } from "@/lib/email-invite"

interface EmailInviteRoleSelectorProps {
  value: EmailInviteRole
  onChange: (role: EmailInviteRole) => void
  disabled?: boolean
}

export function EmailInviteRoleSelector({
  value,
  onChange,
  disabled = false,
}: EmailInviteRoleSelectorProps) {
  const { t } = useLanguage()

  return (
    <fieldset
      disabled={disabled}
      style={{ border: 0, padding: 0, margin: "0 0 0.75rem", minWidth: 0 }}
    >
      <legend style={{
        padding: 0,
        marginBottom: "0.5rem",
        fontSize: "0.78rem",
        fontWeight: 700,
        color: "var(--text-secondary)",
      }}>
        {t("settings.emailInvite.role")}
      </legend>
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
        gap: "0.5rem",
      }}>
        {EMAIL_INVITE_ROLES.map((role) => (
          <button
            key={role}
            type="button"
            className="trip-choice-button"
            aria-pressed={value === role}
            onClick={() => onChange(role)}
            style={{
              minHeight: "54px",
              borderRadius: "10px",
              padding: "0.55rem 0.65rem",
              textAlign: "left",
            }}
          >
            <span style={{ display: "block", fontSize: "0.8rem", fontWeight: 750 }}>
              {t(`settings.emailInvite.role.${role}`)}
            </span>
            <span style={{
              display: "block",
              marginTop: "0.2rem",
              fontSize: "0.68rem",
              lineHeight: 1.35,
              color: "var(--text-muted)",
            }}>
              {t(`settings.emailInvite.role.${role}.desc`)}
            </span>
          </button>
        ))}
      </div>
    </fieldset>
  )
}
