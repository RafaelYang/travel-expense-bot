export interface ReconciliationExpenseInput {
  paymentMethod: "card" | "cash"
  currency: string
}

export type ReconciliationPayload = {
  reconciled: true
  settledAmount?: number
}

export type ReconciliationPayloadResult =
  | { ok: true; payload: ReconciliationPayload }
  | { ok: false; reason: "actual_charge_required" }

export function getInitialActualCharge(value?: number | null) {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? String(value)
    : ""
}

export function isForeignCardExpense(
  expense: ReconciliationExpenseInput,
  baseCurrency: string,
) {
  return expense.paymentMethod === "card" &&
    expense.currency.toUpperCase() !== baseCurrency.toUpperCase()
}

export function buildReconciliationPayload(
  expense: ReconciliationExpenseInput,
  baseCurrency: string,
  actualCharge?: string | number,
): ReconciliationPayloadResult {
  if (!isForeignCardExpense(expense, baseCurrency)) {
    return { ok: true, payload: { reconciled: true } }
  }

  const parsedCharge = typeof actualCharge === "number"
    ? actualCharge
    : actualCharge?.trim() === ""
      ? Number.NaN
      : Number(actualCharge)

  if (!Number.isFinite(parsedCharge) || parsedCharge <= 0) {
    return { ok: false, reason: "actual_charge_required" }
  }

  return {
    ok: true,
    payload: {
      reconciled: true,
      settledAmount: parsedCharge,
    },
  }
}
