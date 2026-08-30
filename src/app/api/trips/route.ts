/**
 * 行程 API — CRUD
 */
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getCurrenciesFromCountries, parseTripCountryPlan } from "@/lib/countries"
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
  expenseAdjustmentsEnabled: z.boolean().optional(),
  serviceFeeEnabled: z.boolean().optional(),
  shopbackRewardEnabled: z.boolean().optional(),
  creditCardRewardEnabled: z.boolean().optional(),
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

    // countries 相容平面、單層與歷史巢狀 JSON，寫入時一律正規化為單層。
    const countryPlan = parseTripCountryPlan(data.countries)
    const tripCurrencies = getCurrenciesFromCountries(countryPlan.list)
    const defaultCurrency = tripCurrencies[0] || data.baseCurrency
    const serviceFeeEnabled = data.serviceFeeEnabled
      ?? data.expenseAdjustmentsEnabled
      ?? false
    const shopbackRewardEnabled = data.shopbackRewardEnabled
      ?? data.expenseAdjustmentsEnabled
      ?? false
    const creditCardRewardEnabled = data.creditCardRewardEnabled
      ?? data.expenseAdjustmentsEnabled
      ?? false

    // 計算行程天數，並預設初始化每一天的目的地為第一個國家
    const start = new Date(data.startDate)
    const end = new Date(data.endDate)
    const totalDays = Math.ceil((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)) + 1
    const firstCountry = countryPlan.list[0] || "TW"
    const daily: string[] = []
    let activeCountry = firstCountry
    for (let i = 0; i < totalDays; i++) {
      activeCountry = countryPlan.daily[i] || activeCountry
      daily.push(activeCountry)
    }

    const countriesPayload = [
      JSON.stringify({
        list: countryPlan.list,
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
        expenseAdjustmentsEnabled:
          serviceFeeEnabled || shopbackRewardEnabled || creditCardRewardEnabled,
        serviceFeeEnabled,
        shopbackRewardEnabled,
        creditCardRewardEnabled,
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
