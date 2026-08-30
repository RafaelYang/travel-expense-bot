export interface ExpenseAmount {
  amount: number
  currency: string
  convertedAmount?: number | null
  settledAmount?: number | null
  reconciledAt?: Date | string | null
  paymentMethod?: string | null
  serviceFee?: number | null
  shopbackReward?: number | null
  creditCardReward?: number | null
}

export interface DepositAmount {
  amount: number
  currency: string
}

export interface CashExchangeAmount {
  type: string
  baseAmount: number
}

export interface ExpenseAdjustmentSummary {
  serviceFee: number
  shopbackReward: number
  creditCardReward: number
  totalRewards: number
  netAdjustment: number
  serviceFeeCount: number
  shopbackRewardCount: number
  creditCardRewardCount: number
}

export function getExpenseBaseAmount(
  expense: ExpenseAmount,
  baseCurrency: string,
): number | null {
  const isForeignCurrency =
    expense.currency.toUpperCase() !== baseCurrency.toUpperCase()
  if (
    isForeignCurrency &&
    expense.paymentMethod === "card" &&
    expense.reconciledAt &&
    typeof expense.settledAmount === "number" &&
    Number.isFinite(expense.settledAmount)
  ) {
    return applyExpenseAdjustments(expense.settledAmount, expense)
  }

  if (!isForeignCurrency) {
    return applyExpenseAdjustments(expense.amount, expense)
  }

  return typeof expense.convertedAmount === "number" && Number.isFinite(expense.convertedAmount)
    ? applyExpenseAdjustments(expense.convertedAmount, expense)
    : null
}

function nonNegativeAdjustment(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : 0
}

export function applyExpenseAdjustments(
  baseAmount: number,
  expense: Pick<ExpenseAmount, "serviceFee" | "shopbackReward" | "creditCardReward">,
) {
  return baseAmount
    + nonNegativeAdjustment(expense.serviceFee)
    - nonNegativeAdjustment(expense.shopbackReward)
    - nonNegativeAdjustment(expense.creditCardReward)
}

export function summarizeExpenseAdjustments(
  expenses: readonly Pick<ExpenseAmount, "serviceFee" | "shopbackReward" | "creditCardReward">[],
): ExpenseAdjustmentSummary {
  let serviceFee = 0
  let shopbackReward = 0
  let creditCardReward = 0
  let serviceFeeCount = 0
  let shopbackRewardCount = 0
  let creditCardRewardCount = 0

  for (const expense of expenses) {
    const expenseServiceFee = nonNegativeAdjustment(expense.serviceFee)
    const expenseShopbackReward = nonNegativeAdjustment(expense.shopbackReward)
    const expenseCreditCardReward = nonNegativeAdjustment(expense.creditCardReward)
    serviceFee += expenseServiceFee
    shopbackReward += expenseShopbackReward
    creditCardReward += expenseCreditCardReward
    if (expenseServiceFee > 0) serviceFeeCount += 1
    if (expenseShopbackReward > 0) shopbackRewardCount += 1
    if (expenseCreditCardReward > 0) creditCardRewardCount += 1
  }

  const totalRewards = shopbackReward + creditCardReward
  return {
    serviceFee,
    shopbackReward,
    creditCardReward,
    totalRewards,
    netAdjustment: serviceFee - totalRewards,
    serviceFeeCount,
    shopbackRewardCount,
    creditCardRewardCount,
  }
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
