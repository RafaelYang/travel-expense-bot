import "server-only"

import { prisma } from "@/lib/prisma"

const writableMemberFilter = (userId: string) => ({
  some: {
    userId,
    role: { in: ["owner", "member"] },
  },
})

export async function findEditableExpense(
  userId: string,
  tripId: string,
  expenseId: string,
) {
  return prisma.expense.findFirst({
    where: {
      id: expenseId,
      tripId,
      trip: { members: writableMemberFilter(userId) },
    },
  })
}

export async function findEditableDeposit(
  userId: string,
  tripId: string,
  depositId: string,
) {
  return prisma.deposit.findFirst({
    where: {
      id: depositId,
      tripId,
      trip: { members: writableMemberFilter(userId) },
    },
  })
}

/**
 * 外幣現金錢包是每位成員獨立的，因此換匯流水只能由原建立者編輯。
 */
export async function findEditableCashExchange(
  userId: string,
  tripId: string,
  exchangeId: string,
) {
  return prisma.cashExchange.findFirst({
    where: {
      id: exchangeId,
      tripId,
      userId,
      trip: { members: writableMemberFilter(userId) },
    },
  })
}

/**
 * LINE 的編輯按鈕只會列出發送者自己的花費。再次在資料層綁定
 * userId + expenseId + writable trip membership，避免 postback 被重放後
 * 修改其他使用者或已退出行程的資料。
 */
export async function findLineEditableExpense(userId: string, expenseId: string) {
  return prisma.expense.findFirst({
    where: {
      id: expenseId,
      userId,
      trip: { members: writableMemberFilter(userId) },
    },
  })
}

export async function findLineEditableExpenseByLineUserId(
  lineUserId: string,
  expenseId: string,
) {
  return prisma.expense.findFirst({
    where: {
      id: expenseId,
      user: { lineUserId },
      trip: {
        members: {
          some: {
            role: { in: ["owner", "member"] },
            user: { lineUserId },
          },
        },
      },
    },
  })
}
