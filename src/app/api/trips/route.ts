/**
 * 行程 API — CRUD
 */
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getCurrenciesFromCountries } from "@/lib/countries"
import { getTripDashboard } from "@/lib/trip-dashboard"
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

  return NextResponse.json(await getTripDashboard(session.user.id))
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

    // 計算行程天數，並預設初始化每一天的目的地為第一個國家
    const start = new Date(data.startDate)
    const end = new Date(data.endDate)
    const totalDays = Math.ceil((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)) + 1
    const firstCountry = data.countries[0] || "TW"
    const daily: string[] = []
    for (let i = 0; i < totalDays; i++) {
      daily.push(firstCountry)
    }

    const countriesPayload = [
      JSON.stringify({
        list: data.countries,
        daily,
      })
    ]

    const trip = await prisma.trip.create({
      data: {
        name: data.name,
        description: data.description,
        startDate: new Date(data.startDate),
        endDate: new Date(data.endDate),
        countries: countriesPayload,
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
