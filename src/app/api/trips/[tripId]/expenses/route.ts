/**
 * 花費 API — 新增 / 取得
 */
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { z } from "zod"

const expenseSchema = z.object({
  category: z.string(),
  item: z.string().min(1),
  amount: z.number().positive(),
  currency: z.string(),
  convertedAmount: z.number().optional(),
  exchangeRate: z.number().optional(),
  date: z.string().optional(),
  note: z.string().optional(),
  source: z.string().default("web"),
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

  return NextResponse.json(expenses)
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

    const expense = await prisma.expense.create({
      data: {
        tripId,
        userId: session.user.id,
        category: data.category,
        item: data.item,
        amount: data.amount,
        currency: data.currency,
        convertedAmount: data.convertedAmount,
        exchangeRate: data.exchangeRate,
        date: data.date ? new Date(data.date) : new Date(),
        note: data.note,
        source: data.source,
      },
      include: {
        user: { select: { id: true, name: true } },
      },
    })

    return NextResponse.json(expense)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0].message }, { status: 400 })
    }
    console.error("Create expense error:", error)
    return NextResponse.json({ error: "記帳失敗" }, { status: 500 })
  }
}
