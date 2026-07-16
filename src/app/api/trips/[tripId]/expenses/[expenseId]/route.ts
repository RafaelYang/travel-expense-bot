/**
 * 單筆花費 API — 編輯 / 刪除
 */
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { convertExpenseAmount } from "@/lib/exchange-rate"
import { findEditableExpense } from "@/lib/trip-access"
import {
  creditCashWallet,
  InsufficientCashBalanceError,
  replaceCashExpenseReservation,
} from "@/lib/cash-wallet"
import {
  createSignedExpenseImagePaths,
  resolveExpenseImageInputs,
} from "@/lib/expense-image-signing"
import { z } from "zod"

const imageInputSchema = z.string().max(1_500_000)

const updateSchema = z.object({
  category: z.string().optional(),
  item: z.string().min(1).optional(),
  amount: z.number().positive().optional(),
  currency: z.string().trim().regex(/^[A-Za-z]{3}$/).transform((value) => value.toUpperCase()).optional(),
  paymentMethod: z.enum(["card", "cash"]).optional(),
  note: z.string().optional().nullable(),
  images: z.array(imageInputSchema).max(3).optional(),
  date: z.string().optional(),
})

// PATCH — 編輯花費
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ tripId: string; expenseId: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "未登入" }, { status: 401 })
  }

  const { tripId, expenseId } = await params

  const existing = await findEditableExpense(session.user.id, tripId, expenseId)
  if (!existing) {
    return NextResponse.json({ error: "找不到此筆花費或無編輯權限" }, { status: 404 })
  }

  try {
    const body = await req.json()
    const data = updateSchema.parse(body)

    // 如果金額或幣種改變，重新計算匯率
    const { images, ...fields } = data
    const updateData: Record<string, unknown> = { ...fields }

    if (images) {
      const resolvedImages = resolveExpenseImageInputs(expenseId, existing.images, images)
      if (!resolvedImages) {
        return NextResponse.json({ error: "圖片參照無效或已過期，請重新載入頁面" }, { status: 400 })
      }
      updateData.images = resolvedImages
    }

    if (data.date) {
      updateData.date = new Date(data.date)
    }

    const newAmount = data.amount ?? existing.amount
    const newCurrency = data.currency ?? existing.currency
    const newPaymentMethod = data.paymentMethod ?? existing.paymentMethod

    if (
      data.amount !== undefined ||
      data.currency !== undefined ||
      data.paymentMethod !== undefined
    ) {
      // 查詢行程基準幣種
      const trip = await prisma.trip.findUnique({
        where: { id: tripId },
        select: { baseCurrency: true },
      })
      const baseCurrency = (trip?.baseCurrency || "TWD").toUpperCase()

      if (newPaymentMethod === "cash" && newCurrency !== baseCurrency) {
        const latestBuy = await prisma.cashExchange.findFirst({
          where: {
            tripId,
            userId: existing.userId,
            type: "buy",
            foreignCurrency: newCurrency,
          },
          orderBy: { date: "desc" },
          select: { exchangeRate: true },
        })
        updateData.exchangeRate = latestBuy?.exchangeRate ?? null
        updateData.convertedAmount = latestBuy
          ? newAmount * latestBuy.exchangeRate
          : null
      } else if (newCurrency !== baseCurrency) {
        const conversion = await convertExpenseAmount(newAmount, newCurrency, baseCurrency)
        if (conversion) {
          updateData.convertedAmount = conversion.convertedAmount
          updateData.exchangeRate = conversion.exchangeRate
        } else {
          return NextResponse.json(
            { error: "匯率暫時無法取得，花費未更新" },
            { status: 503 },
          )
        }
      } else {
        updateData.convertedAmount = newAmount
        updateData.exchangeRate = 1
      }
    }

    const expense = await prisma.$transaction(async (tx) => {
      await replaceCashExpenseReservation(tx, existing, {
        tripId,
        userId: existing.userId,
        paymentMethod: newPaymentMethod,
        currency: newCurrency,
        amount: newAmount,
      })

      return tx.expense.update({
        where: { id: expenseId, tripId },
        data: updateData,
        include: {
          user: { select: { id: true, name: true } },
        },
      })
    })

    return NextResponse.json({
      ...expense,
      images: createSignedExpenseImagePaths(expense.id, expense.images),
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0].message }, { status: 400 })
    }
    if (error instanceof InsufficientCashBalanceError) {
      return NextResponse.json({ error: error.message }, { status: 409 })
    }
    console.error("Update expense error:", error)
    return NextResponse.json({ error: "更新失敗" }, { status: 500 })
  }
}

// DELETE — 刪除花費
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ tripId: string; expenseId: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "未登入" }, { status: 401 })
  }

  const { tripId, expenseId } = await params

  const existing = await findEditableExpense(session.user.id, tripId, expenseId)
  if (!existing) {
    return NextResponse.json({ error: "找不到此筆花費或無刪除權限" }, { status: 404 })
  }

  try {
    await prisma.$transaction(async (tx) => {
      if (existing.paymentMethod === "cash") {
        await creditCashWallet(tx, existing)
      }
      await tx.expense.delete({
        where: { id: expenseId, tripId },
      })
    })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Delete expense error:", error)
    return NextResponse.json({ error: "刪除失敗" }, { status: 500 })
  }
}
