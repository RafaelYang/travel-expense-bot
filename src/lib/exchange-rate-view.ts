export interface RatePoint {
  date: string
  rate: number
}

export interface RateTrendSummary {
  changePercent: number
  minimum: number
  maximum: number
}

export function isUsableRate(rate: unknown): rate is number {
  return typeof rate === "number" && Number.isFinite(rate) && rate > 0
}

export function calculateReferenceConversion(amount: number, rate: number): number | null {
  if (!Number.isFinite(amount) || amount < 0 || !isUsableRate(rate)) return null
  const converted = amount * rate
  return Number.isFinite(converted) ? converted : null
}

export function summarizeRateTrend(points: RatePoint[]): RateTrendSummary | null {
  const rates = points.map((point) => point.rate).filter(isUsableRate)
  if (rates.length < 2) return null

  const first = rates[0]
  const last = rates[rates.length - 1]
  return {
    changePercent: ((last - first) / first) * 100,
    minimum: Math.min(...rates),
    maximum: Math.max(...rates),
  }
}

export function invertRatePoints(points: RatePoint[]): RatePoint[] {
  return points.flatMap((point) => (
    isUsableRate(point.rate)
      ? [{ ...point, rate: 1 / point.rate }]
      : []
  ))
}
