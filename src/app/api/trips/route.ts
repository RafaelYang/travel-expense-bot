/**
 * 行程 API — CRUD
 */
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { z } from "zod"

// 建立行程
const createTripSchema = z.object({
  name: z.string().min(1, "請輸入行程名稱"),
  description: z.string().optional(),
  startDate: z.string(),
  endDate: z.string(),
  defaultCurrency: z.string().default("TWD"),
  baseCurrency: z.string().default("TWD"),
  budgetAmount: z.number().positive().optional(),
})

// GET — 取得我的行程列表
export async function GET() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "未登入" }, { status: 401 })
  }

  const trips = await prisma.trip.findMany({
    where: {
      members: { some: { userId: session.user.id } },
    },
    include: {
      members: {
        include: { user: { select: { id: true, name: true, image: true } } },
      },
      _count: { select: { expenses: true } },
    },
    orderBy: [
      { status: 'asc' }, // active 排前面
      { startDate: 'desc' },
    ],
  })

  // 計算每個行程的花費總額
  const tripsWithTotals = await Promise.all(
    trips.map(async (trip) => {
      const expenseAgg = await prisma.expense.aggregate({
        where: { tripId: trip.id },
        _sum: { convertedAmount: true, amount: true },
      })
      
      return {
        ...trip,
        totalSpent: expenseAgg._sum.convertedAmount || expenseAgg._sum.amount || 0,
      }
    })
  )

  return NextResponse.json(tripsWithTotals)
}

// POST — 建立新行程
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "未登入" }, { status: 401 })
  }

  try {
    const body = await req.json()
    const data = createTripSchema.parse(body)

    const trip = await prisma.trip.create({
      data: {
        name: data.name,
        description: data.description,
        startDate: new Date(data.startDate),
        endDate: new Date(data.endDate),
        defaultCurrency: data.defaultCurrency,
        baseCurrency: data.baseCurrency,
        budgetAmount: data.budgetAmount,
        members: {
          create: {
            userId: session.user.id,
            role: "owner",
          },
        },
      },
      include: {
        members: {
          include: { user: { select: { id: true, name: true } } },
        },
      },
    })

    return NextResponse.json(trip)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0].message }, { status: 400 })
    }
    console.error("Create trip error:", error)
    return NextResponse.json({ error: "建立行程失敗" }, { status: 500 })
  }
}
