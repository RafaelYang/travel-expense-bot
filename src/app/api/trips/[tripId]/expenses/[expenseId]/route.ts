/**
 * 單筆花費 API — 編輯 / 刪除
 */
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { convertExpenseAmount } from "@/lib/exchange-rate"
import { z } from "zod"

const updateSchema = z.object({
  category: z.string().optional(),
  item: z.string().min(1).optional(),
  amount: z.number().positive().optional(),
  currency: z.string().optional(),
  note: z.string().optional().nullable(),
  images: z.array(z.string()).max(3).optional(),
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

  // 檢查成員權限
  const member = await prisma.tripMember.findUnique({
    where: { tripId_userId: { tripId, userId: session.user.id } },
  })
  if (!member || member.role === "viewer") {
    return NextResponse.json({ error: "無編輯權限" }, { status: 403 })
  }

  try {
    const body = await req.json()
    const data = updateSchema.parse(body)

    // 如果金額或幣種改變，重新計算匯率
    const updateData: Record<string, unknown> = { ...data }

    if (data.date) {
      updateData.date = new Date(data.date)
    }

    if (data.amount || data.currency) {
      const existing = await prisma.expense.findUnique({
        where: { id: expenseId },
        select: { amount: true, currency: true, tripId: true },
      })
      if (!existing) {
        return NextResponse.json({ error: "找不到此筆花費" }, { status: 404 })
      }

      const newAmount = data.amount || existing.amount
      const newCurrency = data.currency || existing.currency

      // 查詢行程基準幣種
      const trip = await prisma.trip.findUnique({
        where: { id: tripId },
        select: { baseCurrency: true },
      })
      const baseCurrency = trip?.baseCurrency || 'TWD'

      if (newCurrency !== baseCurrency) {
        const conversion = await convertExpenseAmount(newAmount, newCurrency, baseCurrency)
        if (conversion) {
          updateData.convertedAmount = conversion.convertedAmount
          updateData.exchangeRate = conversion.exchangeRate
        }
      } else {
        updateData.convertedAmount = newAmount
        updateData.exchangeRate = 1
      }
    }

    const expense = await prisma.expense.update({
      where: { id: expenseId },
      data: updateData,
      include: {
        user: { select: { id: true, name: true } },
      },
    })

    return NextResponse.json(expense)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0].message }, { status: 400 })
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

  // 檢查成員權限
  const member = await prisma.tripMember.findUnique({
    where: { tripId_userId: { tripId, userId: session.user.id } },
  })
  if (!member || member.role === "viewer") {
    return NextResponse.json({ error: "無刪除權限" }, { status: 403 })
  }

  try {
    await prisma.expense.delete({
      where: { id: expenseId },
    })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Delete expense error:", error)
    return NextResponse.json({ error: "刪除失敗" }, { status: 500 })
  }
}
