/**
 * 花費 API — 新增 / 取得
 */
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { convertExpenseAmount } from "@/lib/exchange-rate"
import { createSignedExpenseImagePaths } from "@/lib/expense-image-signing"
import { z } from "zod"

const imageDataUrlSchema = z.string()
  .max(1_500_000)
  .regex(/^data:image\/(?:jpeg|png|webp|gif);base64,[a-z0-9+/=]+$/i, "圖片格式錯誤")

const expenseSchema = z.object({
  category: z.enum(["food", "transport", "accommodation", "shopping", "ticket", "other"]),
  item: z.string().trim().min(1).max(200),
  amount: z.number().positive(),
  currency: z.string().trim().regex(/^[A-Za-z]{3}$/).transform((value) => value.toUpperCase()),
  date: z.string().datetime().optional(),
  note: z.string().max(1_000).optional(),
  images: z.array(imageDataUrlSchema).max(3).default([]),
})

// GET — 取得行程花費列表
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ tripId: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "未登入" }, { status: 401 })
  }

  const { tripId } = await params

  // 檢查成員權限
  const member = await prisma.tripMember.findUnique({
    where: { tripId_userId: { tripId, userId: session.user.id } },
  })
  if (!member) {
    return NextResponse.json({ error: "無權限" }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const category = searchParams.get("category")
  const dateStr = searchParams.get("date")

  const where: Record<string, unknown> = { tripId }
  if (category) where.category = category
  if (dateStr) {
    const date = new Date(dateStr)
    const nextDay = new Date(date)
    nextDay.setDate(nextDay.getDate() + 1)
    where.date = { gte: date, lt: nextDay }
  }

  const expenses = await prisma.expense.findMany({
    where,
    include: {
      user: { select: { id: true, name: true, image: true } },
    },
    orderBy: { date: 'desc' },
  })

  return NextResponse.json(expenses.map((expense) => ({
    ...expense,
    images: createSignedExpenseImagePaths(expense.id, expense.images),
  })))
}

// POST — 新增花費
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ tripId: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "未登入" }, { status: 401 })
  }

  const { tripId } = await params

  // 檢查成員權限（viewer 不能記帳）
  const member = await prisma.tripMember.findUnique({
    where: { tripId_userId: { tripId, userId: session.user.id } },
  })
  if (!member || member.role === "viewer") {
    return NextResponse.json({ error: "無記帳權限" }, { status: 403 })
  }

  try {
    const body = await req.json()
    const data = expenseSchema.parse(body)

    // 查詢行程的基準幣種
    const trip = await prisma.trip.findUnique({
      where: { id: tripId },
      select: { baseCurrency: true },
    })
    const baseCurrency = (trip?.baseCurrency || "TWD").toUpperCase()

    // 自動查詢即時匯率並換算
    let convertedAmount: number
    let exchangeRate: number

    if (data.currency !== baseCurrency) {
      const conversion = await convertExpenseAmount(data.amount, data.currency, baseCurrency)
      if (!conversion) {
        return NextResponse.json(
          { error: "匯率暫時無法取得，花費未新增" },
          { status: 503 },
        )
      }
      convertedAmount = conversion.convertedAmount
      exchangeRate = conversion.exchangeRate
    } else {
      convertedAmount = data.amount
      exchangeRate = 1
    }

    const expense = await prisma.expense.create({
      data: {
        tripId,
        userId: session.user.id,
        category: data.category,
        item: data.item,
        amount: data.amount,
        currency: data.currency,
        convertedAmount,
        exchangeRate,
        date: data.date ? new Date(data.date) : new Date(),
        note: data.note,
        images: data.images,
        source: "web",
      },
      include: {
        user: { select: { id: true, name: true } },
      },
    })

    return NextResponse.json({
      ...expense,
      images: createSignedExpenseImagePaths(expense.id, expense.images),
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0].message }, { status: 400 })
    }
    console.error("Create expense error:", error)
    return NextResponse.json({ error: "記帳失敗" }, { status: 500 })
  }
}
