/**
 * 即時匯率工具
 * 
 * 主要來源：CurrencyBeacon（免費版每小時更新、5000 次/月）
 * 備用來源：ExchangeRate API（每日更新、免費免 key）
 * 
 * 快取策略：記憶體快取 30 分鐘，搭配 CurrencyBeacon 每小時更新的頻率
 */

// 匯率快取（避免重複呼叫）
interface RateCacheEntry {
  rates: Record<string, number>
  timestamp: number
  updatedAt?: string // 匯率更新時間
}
const rateCache: Record<string, RateCacheEntry> = {}
const CACHE_TTL = 30 * 60 * 1000 // 30 分鐘快取

/**
 * 取得匯率：from → to
 * 例如：getExchangeRate('EUR', 'TWD') → 34.5（1 EUR = 34.5 TWD）
 */
export async function getExchangeRate(from: string, to: string): Promise<number | null> {
  if (from === to) return 1

  const cached = rateCache[from]
  if (cached && Date.now() - cached.timestamp < CACHE_TTL && cached.rates[to]) {
    return cached.rates[to]
  }

  try {
    // 策略 1：CurrencyBeacon（每小時更新，支援 TWD）
    const result = await fetchFromCurrencyBeacon(from)
    if (result && result.rates[to]) {
      rateCache[from] = { ...result, timestamp: Date.now() }
      return result.rates[to]
    }

    // 策略 2：ExchangeRate API 免費端點（每日更新，作為備用）
    const fallback = await fetchFromExchangeRateApi(from)
    if (fallback && fallback.rates[to]) {
      rateCache[from] = { ...fallback, timestamp: Date.now() }
      return fallback.rates[to]
    }

    return null
  } catch (error) {
    console.error(`[ExchangeRate] 查詢失敗 ${from} → ${to}:`, error)
    return null
  }
}

/**
 * 取得完整匯率資料（含更新時間），供前端 API proxy 使用
 */
export async function getExchangeRates(base: string): Promise<{
  rates: Record<string, number>
  updatedAt: string | null
} | null> {
  const cached = rateCache[base]
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return { rates: cached.rates, updatedAt: cached.updatedAt || null }
  }

  // 策略 1：CurrencyBeacon
  const result = await fetchFromCurrencyBeacon(base)
  if (result) {
    rateCache[base] = { ...result, timestamp: Date.now() }
    return { rates: result.rates, updatedAt: result.updatedAt || null }
  }

  // 策略 2：fallback
  const fallback = await fetchFromExchangeRateApi(base)
  if (fallback) {
    rateCache[base] = { ...fallback, timestamp: Date.now() }
    return { rates: fallback.rates, updatedAt: fallback.updatedAt || null }
  }

  return null
}

/** CurrencyBeacon API — 每小時更新 */
async function fetchFromCurrencyBeacon(base: string): Promise<{
  rates: Record<string, number>
  updatedAt?: string
} | null> {
  const apiKey = process.env.EXCHANGE_RATE_API_KEY
  if (!apiKey) {
    console.warn('[ExchangeRate] 未設定 EXCHANGE_RATE_API_KEY，跳過 CurrencyBeacon')
    return null
  }

  try {
    const res = await fetch(
      `https://api.currencybeacon.com/v1/latest?api_key=${apiKey}&base=${base}`,
      { next: { revalidate: 1800 } } // Next.js 快取 30 分鐘
    )
    if (!res.ok) {
      console.warn(`[CurrencyBeacon] HTTP ${res.status} for base=${base}`)
      return null
    }
    const data = await res.json()

    // CurrencyBeacon 回傳格式：{ meta: { code: 200 }, response: { date, base, rates: { USD: 1.0, ... } } }
    if (data?.meta?.code !== 200 || !data?.response?.rates) {
      console.warn('[CurrencyBeacon] 回應格式異常:', data?.meta)
      return null
    }

    return {
      rates: data.response.rates,
      updatedAt: data.response.date || new Date().toISOString(),
    }
  } catch (err) {
    console.warn('[CurrencyBeacon] 請求失敗:', err)
    return null
  }
}

/** ExchangeRate API 免費端點（備用，每日更新）*/
async function fetchFromExchangeRateApi(base: string): Promise<{
  rates: Record<string, number>
  updatedAt?: string
} | null> {
  try {
    const res = await fetch(
      `https://open.er-api.com/v6/latest/${base}`,
      { next: { revalidate: 1800 } }
    )
    if (!res.ok) return null
    const data = await res.json()
    if (!data.rates) return null

    return {
      rates: data.rates,
      updatedAt: data.time_last_update_utc || new Date().toISOString(),
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
  if (fromCurrency === toCurrency) {
    return { convertedAmount: amount, exchangeRate: 1 }
  }

  const rate = await getExchangeRate(fromCurrency, toCurrency)
  if (rate === null) return null

  return {
    convertedAmount: Math.round(amount * rate * 100) / 100, // 四捨五入到小數第二位
    exchangeRate: Math.round(rate * 10000) / 10000, // 匯率保留四位小數
  }
}
