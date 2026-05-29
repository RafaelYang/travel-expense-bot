/**
 * 行程 API — CRUD
 */
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getCurrenciesFromCountries } from "@/lib/countries"
import { z } from "zod"

// 建立行程
const createTripSchema = z.object({
  name: z.string().min(1, "請輸入行程名稱"),
  description: z.string().optional(),
  startDate: z.string(),
  endDate: z.string(),
  countries: z.array(z.string()).default([]),
  baseCurrency: z.string().default("TWD"),
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
      { startDate: 'desc' }, // 新到舊
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

    // 從國家列表推算預設幣種（第一個國家的幣種，或 baseCurrency）
    const tripCurrencies = getCurrenciesFromCountries(data.countries)
    const defaultCurrency = tripCurrencies[0] || data.baseCurrency

    const trip = await prisma.trip.create({
      data: {
        name: data.name,
        description: data.description,
        startDate: new Date(data.startDate),
        endDate: new Date(data.endDate),
        countries: data.countries,
        defaultCurrency,
        baseCurrency: data.baseCurrency,
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
