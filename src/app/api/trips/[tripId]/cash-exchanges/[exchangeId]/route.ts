import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import { auth } from "@/lib/auth"
import {
  InsufficientCashBalanceError,
  replaceCashExchangeReservation,
} from "@/lib/cash-wallet"
import { prisma } from "@/lib/prisma"
import { findEditableCashExchange } from "@/lib/trip-access"

const updateExchangeSchema = z.object({
  foreignAmount: z.number().positive().finite().optional(),
  baseAmount: z.number().positive().finite().optional(),
  date: z.string().datetime().optional(),
  note: z.string().trim().max(1_000).nullable().optional(),
}).strict().refine(
  (data) => Object.values(data).some((value) => value !== undefined),
  { message: "請至少提供一個要更新的欄位" },
)

class CashExchangeConflictError extends Error {
  constructor() {
    super("此筆換匯已被更新，請重新載入後再試")
    this.name = "CashExchangeConflictError"
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ tripId: string; exchangeId: string }> },
) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "未登入" }, { status: 401 })
  }

  const { tripId, exchangeId } = await params
  const editableExchange = await findEditableCashExchange(
    session.user.id,
    tripId,
    exchangeId,
  )
  if (!editableExchange) {
    return NextResponse.json(
      { error: "找不到此筆換匯或無編輯權限" },
      { status: 404 },
    )
  }

  try {
    const data = updateExchangeSchema.parse(await req.json())

    const result = await prisma.$transaction(async (tx) => {
      const current = await tx.cashExchange.findFirst({
        where: {
          id: exchangeId,
          tripId,
          userId: session.user.id,
          trip: {
            members: {
              some: {
                userId: session.user.id,
                role: { in: ["owner", "member"] },
              },
            },
          },
        },
      })
      if (!current || (current.type !== "buy" && current.type !== "sell")) {
        throw new CashExchangeConflictError()
      }

      const nextForeignAmount = data.foreignAmount ?? current.foreignAmount
      const nextBaseAmount = data.baseAmount ?? current.baseAmount
      const nextDate = data.date ? new Date(data.date) : current.date
      const nextNote = data.note === undefined ? current.note : (data.note || null)
      const nextExchangeRate = nextBaseAmount / nextForeignAmount

      await replaceCashExchangeReservation(
        tx,
        {
          tripId,
          userId: session.user.id,
          type: current.type,
          foreignCurrency: current.foreignCurrency,
          foreignAmount: current.foreignAmount,
        },
        nextForeignAmount,
      )

      // CashExchange 沒有 updatedAt，因此用所有舊值當 optimistic guard。
      // 併發編輯如已改過任一欄位，錢包調整與流水更新會一起回滾。
      const updated = await tx.cashExchange.updateMany({
        where: {
          id: current.id,
          tripId: current.tripId,
          userId: current.userId,
          type: current.type,
          foreignCurrency: current.foreignCurrency,
          foreignAmount: current.foreignAmount,
          baseAmount: current.baseAmount,
          exchangeRate: current.exchangeRate,
          date: current.date,
          note: current.note,
          trip: {
            members: {
              some: {
                userId: session.user.id,
                role: { in: ["owner", "member"] },
              },
            },
          },
        },
        data: {
          foreignAmount: nextForeignAmount,
          baseAmount: nextBaseAmount,
          exchangeRate: nextExchangeRate,
          date: nextDate,
          note: nextNote,
        },
      })
      if (updated.count !== 1) {
        throw new CashExchangeConflictError()
      }

      const exchange = await tx.cashExchange.findUniqueOrThrow({
        where: { id: current.id },
        include: { user: { select: { id: true, name: true } } },
      })

      return {
        exchange,
        totalSpentDelta: current.type === "buy"
          ? nextBaseAmount - current.baseAmount
          : current.baseAmount - nextBaseAmount,
      }
    })

    return NextResponse.json(result)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0].message }, { status: 400 })
    }
    if (error instanceof InsufficientCashBalanceError) {
      return NextResponse.json({ error: error.message }, { status: 409 })
    }
    if (error instanceof CashExchangeConflictError) {
      return NextResponse.json({ error: error.message }, { status: 409 })
    }
    console.error("Update cash exchange error:", error)
    return NextResponse.json({ error: "換匯記錄更新失敗" }, { status: 500 })
  }
}
