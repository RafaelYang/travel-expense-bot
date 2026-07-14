export interface ExpenseAmount {
  amount: number
  currency: string
  convertedAmount?: number | null
}

export interface DepositAmount {
  amount: number
  currency: string
}

export function getExpenseBaseAmount(
  expense: ExpenseAmount,
  baseCurrency: string,
): number | null {
  if (expense.currency.toUpperCase() === baseCurrency.toUpperCase()) {
    return expense.amount
  }

  return typeof expense.convertedAmount === "number" && Number.isFinite(expense.convertedAmount)
    ? expense.convertedAmount
    : null
}

export function summarizeExpenses(
  expenses: ExpenseAmount[],
  baseCurrency: string,
) {
  let total = 0
  let missingConversionCount = 0

  for (const expense of expenses) {
    const amount = getExpenseBaseAmount(expense, baseCurrency)
    if (amount === null) {
      missingConversionCount += 1
      continue
    }
    total += amount
  }

  return { total, missingConversionCount }
}

export function summarizeDeposits(
  deposits: DepositAmount[],
  baseCurrency: string,
) {
  let total = 0
  let foreignCurrencyCount = 0

  for (const deposit of deposits) {
    if (deposit.currency.toUpperCase() !== baseCurrency.toUpperCase()) {
      foreignCurrencyCount += 1
      continue
    }
    total += deposit.amount
  }

  return { total, foreignCurrencyCount }
}
