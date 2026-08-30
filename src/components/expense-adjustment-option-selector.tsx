"use client"

import { useLanguage } from "@/components/language-provider"
import {
  type ExpenseAdjustmentOptions,
} from "@/lib/expense-adjustment-options"

const options = [
  ["serviceFeeEnabled", "adjustmentOption.serviceFee"],
  ["shopbackRewardEnabled", "adjustmentOption.shopback"],
  ["creditCardRewardEnabled", "adjustmentOption.creditCard"],
] as const satisfies readonly [keyof ExpenseAdjustmentOptions, string][]

export function ExpenseAdjustmentOptionSelector({
  value,
  disabled = false,
  onChange,
}: {
  value: ExpenseAdjustmentOptions
  disabled?: boolean
  onChange: (field: keyof ExpenseAdjustmentOptions, enabled: boolean) => void
}) {
  const { t } = useLanguage()

  return (
    <div
      role="group"
      aria-label={t("adjustmentOption.group")}
      style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}
    >
      {options.map(([field, label]) => {
        const checked = value[field]
        return (
          <label
            key={field}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.7rem",
              minHeight: 50,
              padding: "0.8rem 0.9rem",
              borderRadius: 12,
              cursor: disabled ? "default" : "pointer",
              border: checked
                ? "1px solid rgba(14, 165, 233, 0.45)"
                : "1px solid var(--border-color)",
              background: checked
                ? "rgba(14, 165, 233, 0.08)"
                : "var(--bg-card-hover)",
            }}
          >
            <input
              type="checkbox"
              checked={checked}
              disabled={disabled}
              onChange={(event) => onChange(field, event.target.checked)}
              style={{
                width: 20,
                height: 20,
                flexShrink: 0,
                accentColor: "var(--color-primary)",
              }}
            />
            <strong style={{ color: "var(--text-primary)", fontSize: "0.85rem" }}>
              {t(label)}
            </strong>
          </label>
        )
      })}
    </div>
  )
}

