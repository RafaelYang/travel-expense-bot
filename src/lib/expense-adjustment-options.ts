export interface ExpenseAdjustmentOptions {
  serviceFeeEnabled: boolean
  shopbackRewardEnabled: boolean
  creditCardRewardEnabled: boolean
}

export const EXPENSE_ADJUSTMENT_OPTION_FIELDS = [
  "serviceFeeEnabled",
  "shopbackRewardEnabled",
  "creditCardRewardEnabled",
] as const satisfies readonly (keyof ExpenseAdjustmentOptions)[]

export function hasAnyExpenseAdjustmentOption(
  options: ExpenseAdjustmentOptions,
) {
  return EXPENSE_ADJUSTMENT_OPTION_FIELDS.some((field) => options[field])
}

