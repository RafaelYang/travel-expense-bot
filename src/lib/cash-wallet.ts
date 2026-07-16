import "server-only"

import type { Prisma } from "@prisma/client"
import {
  getCashExchangeWalletDelta,
  type CashExchangeType,
} from "@/lib/cash-exchange"

export class InsufficientCashBalanceError extends Error {
  constructor() {
    super("現金餘額不足，請先換匯或調整付款方式")
    this.name = "InsufficientCashBalanceError"
  }
}

interface WalletAmount {
  tripId: string
  userId: string
  currency: string
  amount: number
}

export async function creditCashWallet(
  tx: Prisma.TransactionClient,
  input: WalletAmount,
) {
  const currency = input.currency.toUpperCase()

  return tx.cashWallet.upsert({
    where: {
      tripId_userId_currency: {
        tripId: input.tripId,
        userId: input.userId,
        currency,
      },
    },
    create: {
      tripId: input.tripId,
      userId: input.userId,
      currency,
      balance: input.amount,
    },
    update: { balance: { increment: input.amount } },
  })
}

export async function debitCashWallet(
  tx: Prisma.TransactionClient,
  input: WalletAmount,
) {
  const currency = input.currency.toUpperCase()
  const result = await tx.cashWallet.updateMany({
    where: {
      tripId: input.tripId,
      userId: input.userId,
      currency,
      balance: { gte: input.amount },
    },
    data: { balance: { decrement: input.amount } },
  })

  if (result.count !== 1) {
    throw new InsufficientCashBalanceError()
  }

  return tx.cashWallet.findUniqueOrThrow({
    where: {
      tripId_userId_currency: {
        tripId: input.tripId,
        userId: input.userId,
        currency,
      },
    },
  })
}

interface CashExpenseState {
  tripId: string
  userId: string
  paymentMethod: string
  currency: string
  amount: number
}

/**
 * 在同一個資料庫交易中回補舊現金扣款，再套用新的扣款。
 * 任一步驟失敗時整筆交易會回滾，不會留下半套餘額。
 */
export async function replaceCashExpenseReservation(
  tx: Prisma.TransactionClient,
  previous: CashExpenseState,
  next: CashExpenseState,
) {
  if (previous.paymentMethod === "cash") {
    await creditCashWallet(tx, previous)
  }

  if (next.paymentMethod === "cash") {
    await debitCashWallet(tx, next)
  }
}

interface CashExchangeState {
  tripId: string
  userId: string
  type: CashExchangeType
  foreignCurrency: string
  foreignAmount: number
}

/**
 * 換匯編輯只能調整原本幣別與類型的金額。這個差額必須與
 * CashExchange 更新包在同一個 Prisma transaction 內，否則錢包可能與流水失步。
 */
export async function replaceCashExchangeReservation(
  tx: Prisma.TransactionClient,
  previous: CashExchangeState,
  nextForeignAmount: number,
) {
  const delta = getCashExchangeWalletDelta(
    previous.type,
    previous.foreignAmount,
    nextForeignAmount,
  )
  const walletInput = {
    tripId: previous.tripId,
    userId: previous.userId,
    currency: previous.foreignCurrency,
    amount: Math.abs(delta),
  }

  if (delta > 0) {
    return creditCashWallet(tx, walletInput)
  }
  if (delta < 0) {
    return debitCashWallet(tx, walletInput)
  }
  return null
}
