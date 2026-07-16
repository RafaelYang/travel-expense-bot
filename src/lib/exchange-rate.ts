/**
 * 參考匯率工具
 *
 * 主要來源：CurrencyBeacon（更新頻率依帳號方案）
 * 備用來源：ExchangeRate API（每日更新、免費免 key）
 *
 * 最新報價會快取 30 分鐘；七日趨勢只使用 CurrencyBeacon，避免混合來源。
 */

export const EXCHANGE_RATE_REFRESH_MINUTES = 30
export const EXCHANGE_RATE_HISTORY_DAYS = 7

export type ExchangeRateSource = "currencybeacon" | "exchange-rate-api"

export interface ExchangeRateHistoryPoint {
  date: string
  rate: number
}

export interface ExchangeRateHistory {
  points: ExchangeRateHistoryPoint[]
  source: "currencybeacon"
}

// 匯率快取（避免重複呼叫）
interface RateCacheEntry {
  rates: Record<string, number>
  timestamp: number
  updatedAt?: string // 匯率更新時間
  source: ExchangeRateSource
}
const rateCache: Record<string, RateCacheEntry> = {}
const CACHE_TTL = EXCHANGE_RATE_REFRESH_MINUTES * 60 * 1000
const PROVIDER_TIMEOUT_MS = 6_000

interface HistoryCacheEntry extends ExchangeRateHistory {
  timestamp: number
}

const historyCache: Record<string, HistoryCacheEntry> = {}
const HISTORY_CACHE_TTL = 6 * 60 * 60 * 1000
const MAX_HISTORY_CACHE_ENTRIES = 128

function storeHistoryCache(cacheKey: string, entry: HistoryCacheEntry): void {
  const existingKeys = Object.keys(historyCache)
  if (!(cacheKey in historyCache) && existingKeys.length >= MAX_HISTORY_CACHE_ENTRIES) {
    const oldestKey = existingKeys.reduce((oldest, candidate) => (
      historyCache[candidate].timestamp < historyCache[oldest].timestamp ? candidate : oldest
    ))
    delete historyCache[oldestKey]
  }
  historyCache[cacheKey] = entry
}

function normalizeCurrency(currency: string): string {
  return currency.trim().toUpperCase()
}

function isFinitePositiveRate(rate: unknown): rate is number {
  return typeof rate === "number" && Number.isFinite(rate) && rate > 0
}

export function filterValidExchangeRates(rates: unknown): Record<string, number> {
  if (!rates || typeof rates !== "object" || Array.isArray(rates)) return {}

  const validRates: Record<string, number> = {}
  for (const [currency, rate] of Object.entries(rates as Record<string, unknown>)) {
    if (/^[A-Z]{3}$/.test(currency) && isFinitePositiveRate(rate)) {
      validRates[currency] = rate
    }
  }
  return validRates
}

function formatUtcDate(date: Date): string {
  return date.toISOString().slice(0, 10)
}

export function createExchangeRateHistoryRange(
  referenceDate: Date,
  limit: number = EXCHANGE_RATE_HISTORY_DAYS,
): { startDate: string; endDate: string } {
  const end = new Date(Date.UTC(
    referenceDate.getUTCFullYear(),
    referenceDate.getUTCMonth(),
    referenceDate.getUTCDate(),
  ))
  const start = new Date(end)
  // 多取四天，避免供應商當日尚未發布或中間有缺日，最後再擷取最新 limit 筆。
  start.setUTCDate(start.getUTCDate() - (Math.max(1, limit) + 3))
  return { startDate: formatUtcDate(start), endDate: formatUtcDate(end) }
}

export function parseCurrencyBeaconHistory(
  response: unknown,
  targetCurrency: string,
  limit: number = EXCHANGE_RATE_HISTORY_DAYS,
): ExchangeRateHistoryPoint[] {
  if (!response || typeof response !== "object" || Array.isArray(response)) return []

  const target = normalizeCurrency(targetCurrency)
  const safeLimit = Math.min(30, Math.max(1, Math.trunc(limit) || EXCHANGE_RATE_HISTORY_DAYS))

  return Object.entries(response as Record<string, unknown>)
    .flatMap(([date, row]) => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !row || typeof row !== "object" || Array.isArray(row)) {
        return []
      }
      const rate = (row as Record<string, unknown>)[target]
      return isFinitePositiveRate(rate)
        ? [{ date, rate }]
        : []
    })
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-safeLimit)
}

export function extractCurrencyBeaconHistoryRows(response: unknown): unknown {
  if (!response || typeof response !== "object" || Array.isArray(response)) return response
  const nestedRates = (response as Record<string, unknown>).rates
  return nestedRates && typeof nestedRates === "object" && !Array.isArray(nestedRates)
    ? nestedRates
    : response
}

/**
 * 取得匯率：from → to
 * 例如：getExchangeRate('EUR', 'TWD') → 34.5（1 EUR = 34.5 TWD）
 */
export async function getExchangeRate(from: string, to: string): Promise<number | null> {
  const normalizedFrom = normalizeCurrency(from)
  const normalizedTo = normalizeCurrency(to)
  if (normalizedFrom === normalizedTo) return 1

  const cached = rateCache[normalizedFrom]
  if (cached && Date.now() - cached.timestamp < CACHE_TTL && isFinitePositiveRate(cached.rates[normalizedTo])) {
    return cached.rates[normalizedTo]
  }

  try {
    const result = await fetchFromCurrencyBeacon(normalizedFrom)
    if (result && isFinitePositiveRate(result.rates[normalizedTo])) {
      rateCache[normalizedFrom] = { ...result, timestamp: Date.now() }
      return result.rates[normalizedTo]
    }

    const fallback = await fetchFromExchangeRateApi(normalizedFrom)
    if (fallback && isFinitePositiveRate(fallback.rates[normalizedTo])) {
      rateCache[normalizedFrom] = { ...fallback, timestamp: Date.now() }
      return fallback.rates[normalizedTo]
    }

    return null
  } catch (error) {
    console.error(`[ExchangeRate] 查詢失敗 ${normalizedFrom} → ${normalizedTo}:`, error)
    return null
  }
}

/**
 * 取得完整匯率資料（含更新時間），供前端 API proxy 使用
 */
export async function getExchangeRates(base: string): Promise<{
  rates: Record<string, number>
  updatedAt: string | null
  source: ExchangeRateSource
} | null> {
  const normalizedBase = normalizeCurrency(base)
  const cached = rateCache[normalizedBase]
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return { rates: cached.rates, updatedAt: cached.updatedAt || null, source: cached.source }
  }

  const result = await fetchFromCurrencyBeacon(normalizedBase)
  if (result) {
    rateCache[normalizedBase] = { ...result, timestamp: Date.now() }
    return { rates: result.rates, updatedAt: result.updatedAt || null, source: result.source }
  }

  const fallback = await fetchFromExchangeRateApi(normalizedBase)
  if (fallback) {
    rateCache[normalizedBase] = { ...fallback, timestamp: Date.now() }
    return { rates: fallback.rates, updatedAt: fallback.updatedAt || null, source: fallback.source }
  }

  return null
}

/**
 * 取得同一 CurrencyBeacon 來源的最近報價，供小型趨勢圖使用。
 * 若主要來源或時間序列不可用就回傳 null，不以其他供應商拼接趨勢。
 */
export async function getExchangeRateHistory(
  base: string,
  target: string,
  limit: number = EXCHANGE_RATE_HISTORY_DAYS,
): Promise<ExchangeRateHistory | null> {
  const normalizedBase = normalizeCurrency(base)
  const normalizedTarget = normalizeCurrency(target)
  const safeLimit = Math.min(30, Math.max(1, Math.trunc(limit) || EXCHANGE_RATE_HISTORY_DAYS))
  const cacheKey = `${normalizedBase}:${normalizedTarget}:${safeLimit}`
  const cached = historyCache[cacheKey]
  if (cached && Date.now() - cached.timestamp < HISTORY_CACHE_TTL) {
    return { points: cached.points, source: cached.source }
  }

  const result = await fetchHistoryFromCurrencyBeacon(normalizedBase, normalizedTarget, safeLimit)
  if (!result) return null

  storeHistoryCache(cacheKey, { ...result, timestamp: Date.now() })
  return result
}

/** CurrencyBeacon API — 更新頻率依帳號方案 */
async function fetchFromCurrencyBeacon(base: string): Promise<{
  rates: Record<string, number>
  updatedAt?: string
  source: "currencybeacon"
} | null> {
  const apiKey = process.env.EXCHANGE_RATE_API_KEY
  if (!apiKey) {
    console.warn('[ExchangeRate] 未設定 EXCHANGE_RATE_API_KEY，跳過 CurrencyBeacon')
    return null
  }

  try {
    const res = await fetch(
      `https://api.currencybeacon.com/v1/latest?api_key=${apiKey}&base=${base}`,
      {
        next: { revalidate: EXCHANGE_RATE_REFRESH_MINUTES * 60 },
        signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
      }
    )
    if (!res.ok) {
      console.warn(`[CurrencyBeacon] HTTP ${res.status} for base=${base}`)
      return null
    }
    const data = await res.json()

    // CurrencyBeacon 回傳格式：{ meta: { code: 200 }, response: { date, base, rates: { USD: 1.0, ... } } }
    if (
      data?.meta?.code !== 200 ||
      normalizeCurrency(String(data?.response?.base || "")) !== base
    ) {
      console.warn('[CurrencyBeacon] 回應格式異常:', data?.meta)
      return null
    }

    const rates = filterValidExchangeRates(data.response.rates)
    if (Object.keys(rates).length === 0) return null

    return {
      rates,
      updatedAt: typeof data.response.date === "string" ? data.response.date : undefined,
      source: "currencybeacon",
    }
  } catch (err) {
    console.warn('[CurrencyBeacon] 請求失敗:', err)
    return null
  }
}

async function fetchHistoryFromCurrencyBeacon(
  base: string,
  target: string,
  limit: number,
): Promise<ExchangeRateHistory | null> {
  const apiKey = process.env.EXCHANGE_RATE_API_KEY
  if (!apiKey) return null

  const { startDate, endDate } = createExchangeRateHistoryRange(new Date(), limit)
  const params = new URLSearchParams({
    api_key: apiKey,
    base,
    symbols: target,
    start_date: startDate,
    end_date: endDate,
  })

  try {
    const res = await fetch(`https://api.currencybeacon.com/v1/timeseries?${params}`, {
      next: { revalidate: 6 * 60 * 60 },
      signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
    })
    if (!res.ok) {
      console.warn(`[CurrencyBeacon] timeseries HTTP ${res.status} for ${base}/${target}`)
      return null
    }

    const data = await res.json()
    if (data?.meta?.code !== 200) {
      console.warn('[CurrencyBeacon] timeseries 回應格式異常:', data?.meta)
      return null
    }

    const points = parseCurrencyBeaconHistory(
      extractCurrencyBeaconHistoryRows(data.response),
      target,
      limit,
    )
    return points.length > 0 ? { points, source: "currencybeacon" } : null
  } catch (error) {
    console.warn('[CurrencyBeacon] timeseries 請求失敗:', error)
    return null
  }
}

/** ExchangeRate API 免費端點（備用，每日更新）*/
async function fetchFromExchangeRateApi(base: string): Promise<{
  rates: Record<string, number>
  updatedAt?: string
  source: "exchange-rate-api"
} | null> {
  try {
    const res = await fetch(
      `https://open.er-api.com/v6/latest/${base}`,
      {
        next: { revalidate: 24 * 60 * 60 },
        signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
      }
    )
    if (!res.ok) return null
    const data = await res.json()
    if (data?.result !== "success" || normalizeCurrency(String(data?.base_code || "")) !== base) return null
    const rates = filterValidExchangeRates(data.rates)
    if (Object.keys(rates).length === 0) return null

    return {
      rates,
      updatedAt: typeof data.time_last_update_utc === "string" ? data.time_last_update_utc : undefined,
      source: "exchange-rate-api",
    }
  } catch {
    return null
  }
}

/**
 * 批次換算：將一筆花費從原始幣種換算成基準幣種
 * @returns { convertedAmount, exchangeRate } 或 null（查不到匯率）
 */
export async function convertExpenseAmount(
  amount: number,
  fromCurrency: string,
  toCurrency: string
): Promise<{ convertedAmount: number; exchangeRate: number } | null> {
  const normalizedFrom = normalizeCurrency(fromCurrency)
  const normalizedTo = normalizeCurrency(toCurrency)
  if (normalizedFrom === normalizedTo) {
    return { convertedAmount: amount, exchangeRate: 1 }
  }

  const rate = await getExchangeRate(normalizedFrom, normalizedTo)
  if (rate === null) return null

  return {
    convertedAmount: Math.round(amount * rate * 100) / 100, // 四捨五入到小數第二位
    exchangeRate: Math.round(rate * 10000) / 10000, // 匯率保留四位小數
  }
}
