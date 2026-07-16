/**
 * 匯率查詢 API proxy
 * 前端透過這個端點查詢匯率，避免在客戶端暴露 API key
 * 
 * GET /api/exchange-rate?base=EUR&target=TWD&history=7
 */
import { NextRequest, NextResponse } from "next/server"
import {
  EXCHANGE_RATE_REFRESH_MINUTES,
  getExchangeRateHistory,
  getExchangeRates,
} from "@/lib/exchange-rate"
import { auth } from "@/lib/auth"
import { ALL_CURRENCIES } from "@/lib/countries"

const SUPPORTED_CURRENCIES = new Set(Object.keys(ALL_CURRENCIES))
const RATE_LIMIT_WINDOW_MS = 60_000
const RATE_LIMIT_REQUESTS = 30
const requestWindows = new Map<string, { startedAt: number; count: number }>()

function consumeRateLimit(userId: string): boolean {
  const now = Date.now()
  const current = requestWindows.get(userId)
  if (!current || now - current.startedAt >= RATE_LIMIT_WINDOW_MS) {
    requestWindows.set(userId, { startedAt: now, count: 1 })
    return true
  }
  if (current.count >= RATE_LIMIT_REQUESTS) return false
  current.count += 1
  return true
}

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "未登入" }, { status: 401 })
  }
  if (!consumeRateLimit(session.user.id)) {
    return NextResponse.json(
      { error: "匯率查詢過於頻繁，請稍後再試" },
      { status: 429, headers: { "Retry-After": "60" } },
    )
  }

  const base = req.nextUrl.searchParams.get("base")?.toUpperCase()
  const target = req.nextUrl.searchParams.get("target")?.toUpperCase()
  const historyParam = req.nextUrl.searchParams.get("history")

  if (!base || !/^[A-Z]{3}$/.test(base)) {
    return NextResponse.json({ error: "base 幣別格式錯誤" }, { status: 400 })
  }
  if (!SUPPORTED_CURRENCIES.has(base)) {
    return NextResponse.json({ error: `不支援幣種 ${base}` }, { status: 400 })
  }
  if (target && !/^[A-Z]{3}$/.test(target)) {
    return NextResponse.json({ error: "target 幣別格式錯誤" }, { status: 400 })
  }
  if (target && !SUPPORTED_CURRENCIES.has(target)) {
    return NextResponse.json({ error: `不支援幣種 ${target}` }, { status: 400 })
  }
  if (historyParam && !target) {
    return NextResponse.json({ error: "查詢歷史匯率時必須指定 target" }, { status: 400 })
  }

  const historyDays = historyParam === null
    ? 0
    : Number.parseInt(historyParam, 10)
  if (historyParam !== null && (!/^\d+$/.test(historyParam) || historyDays < 1 || historyDays > 30)) {
    return NextResponse.json({ error: "history 必須是 1 到 30 的整數" }, { status: 400 })
  }

  try {
    const [result, requestedHistory] = await Promise.all([
      getExchangeRates(base),
      target && historyDays > 0
        ? getExchangeRateHistory(base, target, historyDays)
        : Promise.resolve(null),
    ])
    if (!result) {
      return NextResponse.json({ error: "查詢匯率失敗" }, { status: 502 })
    }

    // 如果指定了 target，只回傳該幣種的匯率
    if (target) {
      const rate = result.rates[target]
      if (!rate) {
        return NextResponse.json({ error: `不支援幣種 ${target}` }, { status: 404 })
      }
      const history = requestedHistory?.source === result.source
        ? requestedHistory.points
        : []
      return NextResponse.json({
        base,
        target,
        rate,
        updatedAt: result.updatedAt,
        quotedAt: result.updatedAt,
        source: result.source,
        refreshIntervalMinutes: EXCHANGE_RATE_REFRESH_MINUTES,
        history: historyDays > 0 ? history : undefined,
        historyDays: historyDays > 0 ? historyDays : undefined,
        historyStatus: historyDays > 0
          ? (history.length > 0 ? "available" : "unavailable")
          : undefined,
      })
    }

    // 回傳所有匯率
    return NextResponse.json({
      base,
      rates: result.rates,
      updatedAt: result.updatedAt,
      quotedAt: result.updatedAt,
      source: result.source,
      refreshIntervalMinutes: EXCHANGE_RATE_REFRESH_MINUTES,
    })
  } catch {
    return NextResponse.json({ error: "匯率服務異常" }, { status: 500 })
  }
}
