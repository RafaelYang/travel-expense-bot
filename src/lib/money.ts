export interface ExpenseAmount {
  amount: number
  currency: string
  convertedAmount?: number | null
  paymentMethod?: string | null
}

export interface DepositAmount {
  amount: number
  currency: string
}

export interface CashExchangeAmount {
  type: string
  baseAmount: number
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

/**
 * 旅程的實際基準幣淨流出：刷卡／額外支出 + 換入外幣 - 換回款項。
 * 現金消費已在換入外幣時認列，因此不在此重複加總。
 */
export function summarizeTripSpending(
  expenses: ExpenseAmount[],
  exchanges: CashExchangeAmount[],
  baseCurrency: string,
) {
  const expenseSummary = summarizeExpenses(
    expenses.filter((expense) => expense.paymentMethod !== "cash"),
    baseCurrency,
  )
  const exchangeNet = exchanges.reduce((total, exchange) => {
    return total + (exchange.type === "sell" ? -exchange.baseAmount : exchange.baseAmount)
  }, 0)

  return {
    total: expenseSummary.total + exchangeNet,
    missingConversionCount: expenseSummary.missingConversionCount,
    exchangeNet,
  }
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
