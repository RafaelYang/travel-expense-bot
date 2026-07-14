/**
 * 匯率查詢 API proxy
 * 前端透過這個端點查詢匯率，避免在客戶端暴露 API key
 * 
 * GET /api/exchange-rate?base=EUR&target=TWD
 */
import { NextRequest, NextResponse } from "next/server"
import { getExchangeRates } from "@/lib/exchange-rate"
import { auth } from "@/lib/auth"

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "未登入" }, { status: 401 })
  }

  const base = req.nextUrl.searchParams.get("base")?.toUpperCase()
  const target = req.nextUrl.searchParams.get("target")?.toUpperCase()

  if (!base || !/^[A-Z]{3}$/.test(base)) {
    return NextResponse.json({ error: "base 幣別格式錯誤" }, { status: 400 })
  }
  if (target && !/^[A-Z]{3}$/.test(target)) {
    return NextResponse.json({ error: "target 幣別格式錯誤" }, { status: 400 })
  }

  try {
    const result = await getExchangeRates(base)
    if (!result) {
      return NextResponse.json({ error: "查詢匯率失敗" }, { status: 502 })
    }

    // 如果指定了 target，只回傳該幣種的匯率
    if (target) {
      const rate = result.rates[target]
      if (!rate) {
        return NextResponse.json({ error: `不支援幣種 ${target}` }, { status: 404 })
      }
      return NextResponse.json({
        base,
        target,
        rate,
        updatedAt: result.updatedAt,
      })
    }

    // 回傳所有匯率
    return NextResponse.json({
      base,
      rates: result.rates,
      updatedAt: result.updatedAt,
    })
  } catch {
    return NextResponse.json({ error: "匯率服務異常" }, { status: 500 })
  }
}
