export type CashExchangeType = "buy" | "sell"

/**
 * 計算編輯換匯後應對外幣錢包套用的差額。
 * 正數代表回存錢包，負數代表再從錢包扣除。
 */
export function getCashExchangeWalletDelta(
  type: CashExchangeType,
  previousForeignAmount: number,
  nextForeignAmount: number,
) {
  const direction = type === "buy" ? 1 : -1
  return direction * (nextForeignAmount - previousForeignAmount)
}
