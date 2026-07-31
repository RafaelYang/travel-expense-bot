"use client"

import { useEffect, useMemo, useState } from "react"
import * as Dialog from "@radix-ui/react-dialog"
import {
  ArrowLeft,
  ArrowDownRight,
  ArrowRightLeft,
  ArrowUpRight,
  Calculator,
  ChevronDown,
  Loader2,
  RefreshCw,
  TrendingUp,
  X,
} from "lucide-react"
import { useLanguage } from "@/components/language-provider"
import { ALL_CURRENCIES, COUNTRIES } from "@/lib/countries"
import { getCurrencySymbol } from "@/lib/utils"
import {
  calculateReferenceConversion,
  formatHeadlineRate,
  invertRatePoints,
  isUsableRate,
  summarizeRateTrend,
  type RatePoint,
} from "@/lib/exchange-rate-view"

type RateSource = "currencybeacon" | "exchange-rate-api"

interface ExchangeRateResponse {
  base: string
  target: string
  rate: number
  updatedAt: string | null
  source: RateSource
  refreshIntervalMinutes: number
  history: RatePoint[]
}

interface ExchangeRateCardProps {
  baseCurrency: string
  defaultForeignCurrency: string
  suggestedCurrencies: string[]
}

const SOURCE_META: Record<RateSource, { label: string; href: string }> = {
  currencybeacon: { label: "CurrencyBeacon", href: "https://currencybeacon.com/" },
  "exchange-rate-api": { label: "ExchangeRate-API", href: "https://www.exchangerate-api.com/" },
}

const CURRENCY_FLAG_OVERRIDES: Record<string, string> = {
  EUR: "🇪🇺",
  TWD: "🇹🇼",
}

function normalizeCurrency(value: string): string {
  return value.trim().toUpperCase()
}

function currencyLabel(currency: string): string {
  return ALL_CURRENCIES[currency]?.label ?? currency
}

function currencyFlag(currency: string): string {
  return CURRENCY_FLAG_OVERRIDES[currency]
    ?? COUNTRIES.find((country) => country.currency === currency)?.flag
    ?? "💱"
}

function currencyName(currency: string): string {
  return ALL_CURRENCIES[currency]?.nameCn ?? currency
}

function parseRateResponse(payload: unknown): ExchangeRateResponse | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null
  const data = payload as Record<string, unknown>
  const base = typeof data.base === "string" ? normalizeCurrency(data.base) : ""
  const target = typeof data.target === "string" ? normalizeCurrency(data.target) : ""
  const source = data.source === "currencybeacon" || data.source === "exchange-rate-api"
    ? data.source
    : null
  if (!/^[A-Z]{3}$/.test(base) || !/^[A-Z]{3}$/.test(target) || !isUsableRate(data.rate) || !source) {
    return null
  }

  const history = Array.isArray(data.history)
    ? data.history.flatMap((point) => {
        if (!point || typeof point !== "object" || Array.isArray(point)) return []
        const candidate = point as Record<string, unknown>
        return typeof candidate.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(candidate.date) && isUsableRate(candidate.rate)
          ? [{ date: candidate.date, rate: candidate.rate }]
          : []
      }).sort((a, b) => a.date.localeCompare(b.date))
    : []

  return {
    base,
    target,
    rate: data.rate,
    updatedAt: typeof data.updatedAt === "string" ? data.updatedAt : null,
    source,
    refreshIntervalMinutes:
      typeof data.refreshIntervalMinutes === "number" && data.refreshIntervalMinutes > 0
        ? data.refreshIntervalMinutes
        : 30,
    history,
  }
}

function rateFractionDigits(rate: number): number {
  if (rate >= 100) return 2
  if (rate >= 1) return 4
  return 6
}

function formatRate(rate: number, locale: string): string {
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: rate >= 100 ? 2 : 0,
    maximumFractionDigits: rateFractionDigits(rate),
  }).format(rate)
}

function formatAmount(amount: number, currency: string, locale: string): string {
  const zeroDecimal = currency === "JPY" || currency === "KRW" || currency === "VND"
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: 0,
    maximumFractionDigits: zeroDecimal ? 0 : 2,
  }).format(amount)
}

function formatQuoteTime(value: string | null): string | null {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  const utc8 = new Date(date.getTime() + 8 * 60 * 60 * 1000)
  const hour = String(utc8.getUTCHours()).padStart(2, "0")
  const minute = String(utc8.getUTCMinutes()).padStart(2, "0")
  return `${utc8.getUTCFullYear()}/${utc8.getUTCMonth() + 1}/${utc8.getUTCDate()} ${hour}:${minute}`
}

function formatShortDate(value: string): string {
  const date = new Date(`${value}T00:00:00Z`)
  return `${date.getUTCMonth() + 1}/${date.getUTCDate()}`
}

function RateSparkline({ points, locale, currency }: { points: RatePoint[]; locale: string; currency: string }) {
  if (points.length < 2) return null

  const width = 400
  const height = 150
  const horizontalPadding = 16
  const verticalPadding = 18
  const rates = points.map((point) => point.rate)
  const minimum = Math.min(...rates)
  const maximum = Math.max(...rates)
  const rawSpan = maximum - minimum
  const span = rawSpan || Math.max(Math.abs(maximum) * 0.01, 1)
  const yMinimum = minimum - span * 0.16
  const yMaximum = maximum + span * 0.16

  const coordinates = points.map((point, index) => {
    const x = horizontalPadding + (index / (points.length - 1)) * (width - horizontalPadding * 2)
    const y = verticalPadding + ((yMaximum - point.rate) / (yMaximum - yMinimum)) * (height - verticalPadding * 2)
    return { ...point, x, y }
  })
  const path = coordinates.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" ")
  const ariaLabel = points
    .map((point) => `${formatShortDate(point.date)} ${formatRate(point.rate, locale)} ${currency}`)
    .join("，")

  return (
    <svg
      className="exchange-rate-chart"
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={ariaLabel}
      preserveAspectRatio="xMidYMid meet"
    >
      {[0.25, 0.5, 0.75].map((position) => (
        <line
          key={position}
          x1={horizontalPadding}
          x2={width - horizontalPadding}
          y1={height * position}
          y2={height * position}
          className="exchange-rate-chart-grid"
        />
      ))}
      <path d={path} className="exchange-rate-chart-line" />
      {coordinates.map((point, index) => (
        <circle
          key={point.date}
          cx={point.x}
          cy={point.y}
          r={index === coordinates.length - 1 ? 5 : 3.5}
          className={index === coordinates.length - 1 ? "exchange-rate-chart-point latest" : "exchange-rate-chart-point"}
        >
          <title>{`${point.date} · 1 = ${formatRate(point.rate, locale)} ${currency}`}</title>
        </circle>
      ))}
    </svg>
  )
}

type CalculatorOperator = "add" | "subtract" | "multiply" | "divide"

const MAX_CALCULATOR_DIGITS = 12

function calculateOperation(left: number, right: number, operator: CalculatorOperator): number | null {
  const result = operator === "add"
    ? left + right
    : operator === "subtract"
      ? left - right
      : operator === "multiply"
        ? left * right
        : right === 0
          ? Number.NaN
          : left / right

  return Number.isFinite(result) ? result : null
}

function formatCalculatorValue(value: number): string {
  if (!Number.isFinite(value)) return "0"
  const rounded = Number(value.toPrecision(MAX_CALCULATOR_DIGITS))
  const plain = String(rounded)
  if (!plain.includes("e")) return plain
  return rounded.toLocaleString("en-US", {
    useGrouping: false,
    maximumFractionDigits: MAX_CALCULATOR_DIGITS,
  })
}

interface CurrencyFlagSelectProps {
  ariaLabel: string
  currencyOptions: string[]
  onChange: (currency: string) => void
  placeholder: string
  value: string
}

function CurrencyFlagSelect({
  ariaLabel,
  currencyOptions,
  onChange,
  placeholder,
  value,
}: CurrencyFlagSelectProps) {
  return (
    <label className="exchange-rate-currency-picker">
      <span className="exchange-rate-currency-flag" aria-hidden="true">
        {value ? currencyFlag(value) : "💱"}
        <span><ChevronDown size={12} /></span>
      </span>
      <strong>{value || "—"}</strong>
      <small>{value ? currencyName(value) : placeholder}</small>
      <select
        value={value}
        aria-label={ariaLabel}
        onChange={(event) => onChange(event.target.value)}
      >
        {!value && <option value="">{placeholder}</option>}
        {currencyOptions.map((currency) => (
          <option key={currency} value={currency}>{currencyLabel(currency)}</option>
        ))}
      </select>
    </label>
  )
}

interface MobileExchangeCalculatorProps {
  amount: string
  convertedAmount: number | null
  currencyOptions: string[]
  data: ExchangeRateResponse | null
  error: boolean
  fromCurrency: string
  loading: boolean
  locale: string
  onAmountChange: (amount: string) => void
  onChangePair: (side: "from" | "to", currency: string) => void
  onRetry: () => void
  onSwap: () => void
  toCurrency: string
  t: ReturnType<typeof useLanguage>["t"]
}

function MobileExchangeCalculator({
  amount,
  convertedAmount,
  currencyOptions,
  data,
  error,
  fromCurrency,
  loading,
  locale,
  onAmountChange,
  onChangePair,
  onRetry,
  onSwap,
  toCurrency,
  t,
}: MobileExchangeCalculatorProps) {
  const [accumulator, setAccumulator] = useState<number | null>(null)
  const [pendingOperator, setPendingOperator] = useState<CalculatorOperator | null>(null)
  const [waitingForOperand, setWaitingForOperand] = useState(false)
  const activeData = data?.base === fromCurrency && data.target === toCurrency ? data : null
  const visibleAmount = amount || "0"
  const currentValue = Number(visibleAmount)

  const inputDigit = (digit: string) => {
    onAmountChange((() => {
      if (waitingForOperand || visibleAmount === "0") return digit
      const digitCount = visibleAmount.replace(/[^0-9]/gu, "").length
      return digitCount >= MAX_CALCULATOR_DIGITS ? visibleAmount : `${visibleAmount}${digit}`
    })())
    setWaitingForOperand(false)
  }

  const inputDecimal = () => {
    if (waitingForOperand) {
      onAmountChange("0.")
      setWaitingForOperand(false)
      return
    }
    if (!visibleAmount.includes(".")) onAmountChange(`${visibleAmount}.`)
  }

  const clearCalculator = () => {
    onAmountChange("0")
    setAccumulator(null)
    setPendingOperator(null)
    setWaitingForOperand(false)
  }

  const backspace = () => {
    if (waitingForOperand) {
      onAmountChange("0")
      setWaitingForOperand(false)
      return
    }
    onAmountChange(visibleAmount.length > 1 ? visibleAmount.slice(0, -1) : "0")
  }

  const percentage = () => {
    if (!Number.isFinite(currentValue)) return
    onAmountChange(formatCalculatorValue(currentValue / 100))
    setWaitingForOperand(false)
  }

  const chooseOperator = (operator: CalculatorOperator) => {
    if (!Number.isFinite(currentValue)) return
    if (waitingForOperand) {
      setPendingOperator(operator)
      return
    }

    const result = accumulator !== null && pendingOperator
      ? calculateOperation(accumulator, currentValue, pendingOperator)
      : currentValue
    const nextValue = result ?? 0
    onAmountChange(formatCalculatorValue(nextValue))
    setAccumulator(nextValue)
    setPendingOperator(operator)
    setWaitingForOperand(true)
  }

  const equals = () => {
    if (accumulator === null || !pendingOperator || !Number.isFinite(currentValue)) return
    const result = calculateOperation(accumulator, currentValue, pendingOperator)
    onAmountChange(formatCalculatorValue(result ?? 0))
    setAccumulator(null)
    setPendingOperator(null)
    setWaitingForOperand(true)
  }

  const operatorButton = (
    operator: CalculatorOperator,
    symbol: string,
    label: string,
  ) => (
    <button
      type="button"
      className="exchange-rate-key exchange-rate-key--operator"
      aria-label={label}
      aria-pressed={pendingOperator === operator}
      onClick={() => chooseOperator(operator)}
    >
      {symbol}
    </button>
  )

  return (
    <>
      <div className="exchange-rate-mobile-display">
        <div className="exchange-rate-mobile-values">
          <div className="exchange-rate-mobile-value-row">
            <CurrencyFlagSelect
              ariaLabel={t("trip.rate.from")}
              currencyOptions={currencyOptions}
              onChange={(currency) => onChangePair("from", currency)}
              placeholder={t("trip.rate.select")}
              value={fromCurrency}
            />
            <div className="exchange-rate-mobile-amount">
              <span>{t("trip.rate.from")}</span>
              <output aria-live="polite">{visibleAmount}</output>
            </div>
          </div>

          <div className="exchange-rate-mobile-value-row exchange-rate-mobile-value-row--result">
            <CurrencyFlagSelect
              ariaLabel={t("trip.rate.to")}
              currencyOptions={currencyOptions}
              onChange={(currency) => onChangePair("to", currency)}
              placeholder={t("trip.rate.select")}
              value={toCurrency}
            />
            <div className="exchange-rate-mobile-amount">
              <span>{t("trip.rate.to")}</span>
              <output aria-live="polite">
                {convertedAmount === null
                  ? "—"
                  : `${getCurrencySymbol(toCurrency)}${formatAmount(convertedAmount, toCurrency, locale)}`}
              </output>
            </div>
          </div>
        </div>
      </div>

      <div className="exchange-rate-mobile-status" aria-live="polite">
        {loading ? (
          <><Loader2 size={14} className="exchange-rate-spinner" aria-hidden="true" />{t("trip.rate.loading")}</>
        ) : error ? (
          <button type="button" onClick={onRetry}>
            <RefreshCw size={14} aria-hidden="true" />{t("trip.rate.retry")}
          </button>
        ) : activeData ? (
          <span>{`1 ${activeData.base} ≈ ${formatHeadlineRate(activeData.rate, locale)} ${activeData.target}`}</span>
        ) : (
          <span>{t("trip.rate.choosePrompt")}</span>
        )}
      </div>

      <div className="exchange-rate-mobile-keypad" role="group" aria-label={t("trip.rate.calculatorKeys")}>
        <button type="button" className="exchange-rate-key" onClick={clearCalculator} aria-label={t("trip.rate.clear")}>C</button>
        <button type="button" className="exchange-rate-key" onClick={backspace} aria-label={t("trip.rate.backspace")}>
          <ArrowLeft size={27} aria-hidden="true" />
        </button>
        <button type="button" className="exchange-rate-key" onClick={onSwap} aria-label={t("trip.rate.swap")} disabled={!fromCurrency || !toCurrency}>
          <ArrowRightLeft size={25} aria-hidden="true" />
        </button>
        {operatorButton("divide", "÷", t("trip.rate.divide"))}
        {(["7", "8", "9"] as const).map((digit) => (
          <button key={digit} type="button" className="exchange-rate-key" onClick={() => inputDigit(digit)}>{digit}</button>
        ))}
        {operatorButton("multiply", "×", t("trip.rate.multiply"))}
        {(["4", "5", "6"] as const).map((digit) => (
          <button key={digit} type="button" className="exchange-rate-key" onClick={() => inputDigit(digit)}>{digit}</button>
        ))}
        {operatorButton("subtract", "−", t("trip.rate.subtract"))}
        {(["1", "2", "3"] as const).map((digit) => (
          <button key={digit} type="button" className="exchange-rate-key" onClick={() => inputDigit(digit)}>{digit}</button>
        ))}
        {operatorButton("add", "+", t("trip.rate.add"))}
        <button type="button" className="exchange-rate-key" onClick={percentage} aria-label={t("trip.rate.percent")}>%</button>
        <button type="button" className="exchange-rate-key" onClick={() => inputDigit("0")}>0</button>
        <button type="button" className="exchange-rate-key" onClick={inputDecimal} aria-label={t("trip.rate.decimal")}>.</button>
        <button type="button" className="exchange-rate-key exchange-rate-key--equals" onClick={equals} aria-label={t("trip.rate.equals")}>=</button>
      </div>
    </>
  )
}

export function ExchangeRateCard({
  baseCurrency,
  defaultForeignCurrency,
  suggestedCurrencies,
}: ExchangeRateCardProps) {
  const { t, locale } = useLanguage()
  const normalizedBase = normalizeCurrency(baseCurrency)
  const preferredCurrencies = useMemo(() => (
    [...new Set([defaultForeignCurrency, ...suggestedCurrencies]
      .map(normalizeCurrency)
      .filter((currency) => ALL_CURRENCIES[currency]))]
  ), [defaultForeignCurrency, suggestedCurrencies])
  const currencyOptions = useMemo(() => (
    [...new Set([...preferredCurrencies, normalizedBase, ...Object.keys(ALL_CURRENCIES).sort()])]
  ), [normalizedBase, preferredCurrencies])
  const initialForeignCurrency = preferredCurrencies.find((currency) => currency !== normalizedBase) || ""

  const [fromCurrency, setFromCurrency] = useState(initialForeignCurrency)
  const [toCurrency, setToCurrency] = useState(normalizedBase)
  const [amount, setAmount] = useState("0")
  const [data, setData] = useState<ExchangeRateResponse | null>(null)
  const [error, setError] = useState(false)
  const [retryToken, setRetryToken] = useState(0)
  const [mobileOpen, setMobileOpen] = useState(false)

  const pairKey = fromCurrency && toCurrency ? `${fromCurrency}:${toCurrency}` : ""
  const dataKey = data ? `${data.base}:${data.target}` : ""

  useEffect(() => {
    if (!pairKey || fromCurrency === toCurrency || dataKey === pairKey) return

    const controller = new AbortController()

    fetch(`/api/exchange-rate?base=${fromCurrency}&target=${toCurrency}&history=7`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        const parsed = parseRateResponse(await response.json())
        if (!parsed || `${parsed.base}:${parsed.target}` !== pairKey) throw new Error("Invalid rate response")
        return parsed
      })
      .then((nextData) => {
        if (!controller.signal.aborted) setData(nextData)
      })
      .catch((requestError) => {
        if (requestError instanceof DOMException && requestError.name === "AbortError") return
        if (!controller.signal.aborted) setError(true)
      })

    return () => controller.abort()
  }, [dataKey, fromCurrency, pairKey, retryToken, toCurrency])

  const changePair = (side: "from" | "to", currency: string) => {
    const nextCurrency = normalizeCurrency(currency)
    setData(null)
    setError(false)
    if (side === "from") {
      if (nextCurrency === toCurrency) {
        if (!fromCurrency) return
        setToCurrency(fromCurrency)
      }
      setFromCurrency(nextCurrency)
      return
    }
    if (nextCurrency === fromCurrency) setFromCurrency(toCurrency)
    setToCurrency(nextCurrency)
  }

  const swapCurrencies = () => {
    if (!fromCurrency || !toCurrency) return
    setError(false)
    setData((current) => {
      if (!current || current.base !== fromCurrency || current.target !== toCurrency) return null
      return {
        ...current,
        base: current.target,
        target: current.base,
        rate: 1 / current.rate,
        history: invertRatePoints(current.history),
      }
    })
    setFromCurrency(toCurrency)
    setToCurrency(fromCurrency)
  }

  const numericAmount = Number(amount.replaceAll(",", ""))
  const convertedAmount = data && dataKey === pairKey
    ? calculateReferenceConversion(numericAmount, data.rate)
    : null
  const trend = data ? summarizeRateTrend(data.history) : null
  const quoteTime = data ? formatQuoteTime(data.updatedAt) : null
  const sourceMeta = data ? SOURCE_META[data.source] : null
  const loading = Boolean(pairKey && dataKey !== pairKey && !error)
  const retryRate = () => {
    setError(false)
    setRetryToken((value) => value + 1)
  }

  return (
    <>
      <section className="glass-card exchange-rate-card animate-fade-in-up" aria-labelledby="exchange-rate-title">
      <div className="exchange-rate-header">
        <div>
          <div className="exchange-rate-title-row">
            <TrendingUp size={19} aria-hidden="true" />
            <h2 id="exchange-rate-title">{t("trip.rate.title")}</h2>
          </div>
          <p>{t("trip.rate.subtitle")}</p>
        </div>
        <span className="exchange-rate-refresh-chip">
          <RefreshCw size={13} aria-hidden="true" />
          {t("trip.rate.refresh", { minutes: String(data?.refreshIntervalMinutes || 30) })}
        </span>
      </div>

      <div className="exchange-rate-pair-controls" role="group" aria-label={t("trip.rate.pair")}>
        <label>
          <span>{t("trip.rate.from")}</span>
          <select value={fromCurrency} onChange={(event) => changePair("from", event.target.value)}>
            {!fromCurrency && <option value="">{t("trip.rate.select")}</option>}
            {currencyOptions.map((currency) => (
              <option key={currency} value={currency} disabled={!fromCurrency && currency === toCurrency}>
                {currencyLabel(currency)}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="exchange-rate-swap"
          onClick={swapCurrencies}
          aria-label={t("trip.rate.swap")}
          disabled={!fromCurrency || !toCurrency}
        >
          <ArrowRightLeft size={18} aria-hidden="true" />
        </button>
        <label>
          <span>{t("trip.rate.to")}</span>
          <select value={toCurrency} onChange={(event) => changePair("to", event.target.value)}>
            {currencyOptions.map((currency) => (
              <option key={currency} value={currency}>{currencyLabel(currency)}</option>
            ))}
          </select>
        </label>
      </div>

      {!fromCurrency ? (
        <div className="exchange-rate-state">{t("trip.rate.choosePrompt")}</div>
      ) : loading && !data ? (
        <div className="exchange-rate-state" role="status">
          <Loader2 size={19} className="exchange-rate-spinner" aria-hidden="true" />
          {t("trip.rate.loading")}
        </div>
      ) : error && !data ? (
        <div className="exchange-rate-state exchange-rate-error" role="alert">
          <span>{t("trip.rate.error")}</span>
          <button
            type="button"
            onClick={retryRate}
          >
            <RefreshCw size={15} aria-hidden="true" />
            {t("trip.rate.retry")}
          </button>
        </div>
      ) : data ? (
        <>
          <div className="exchange-rate-content">
            <div className="exchange-rate-quote-column">
              <div className="exchange-rate-eyebrow">{t("trip.rate.latest")}</div>
              <div className="exchange-rate-main-quote">
                <span>1 {data.base}</span>
                <strong className="exchange-rate-main-quote-value">
                  ≈ {getCurrencySymbol(data.target)}{formatHeadlineRate(data.rate, locale)}
                  <span>{data.target}</span>
                </strong>
              </div>
              <div className="exchange-rate-meta">
                {quoteTime && <span>{t("trip.rate.quotedAt", { time: quoteTime })}</span>}
                {sourceMeta && (
                  <a href={sourceMeta.href} target="_blank" rel="noreferrer">
                    {t("trip.rate.source", { source: sourceMeta.label })}
                  </a>
                )}
              </div>

              <div className="exchange-rate-calculator">
                <label>
                  <span>{t("trip.rate.amount", { currency: data.base })}</span>
                  <div className="exchange-rate-amount-input">
                    <input
                      value={amount}
                      inputMode="decimal"
                      aria-label={t("trip.rate.amount", { currency: data.base })}
                      onChange={(event) => setAmount(event.target.value)}
                    />
                    <span>{data.base}</span>
                  </div>
                </label>
                <div className="exchange-rate-calculator-result" aria-live="polite">
                  <span>{t("trip.rate.estimated")}</span>
                  <strong>
                    {convertedAmount === null
                      ? "—"
                      : (
                        <>
                          <span>{`${getCurrencySymbol(data.target)}${formatAmount(convertedAmount, data.target, locale)}`}</span>
                          <span className="exchange-rate-calculator-code">{data.target}</span>
                        </>
                      )}
                  </strong>
                </div>
              </div>
            </div>

            <div className="exchange-rate-trend-column">
              <div className="exchange-rate-trend-heading">
                <div>
                  <strong>{t("trip.rate.history", { count: String(data.history.length) })}</strong>
                  {data.history.length > 0 && (
                    <span>{`${formatShortDate(data.history[0].date)}–${formatShortDate(data.history[data.history.length - 1].date)}`}</span>
                  )}
                </div>
                {trend && (
                  <span className="exchange-rate-change">
                    {trend.changePercent >= 0
                      ? <ArrowUpRight size={16} aria-hidden="true" />
                      : <ArrowDownRight size={16} aria-hidden="true" />}
                    {t("trip.rate.change", {
                      change: `${trend.changePercent >= 0 ? "+" : ""}${trend.changePercent.toFixed(2)}%`,
                    })}
                  </span>
                )}
              </div>
              {data.history.length >= 2 && trend ? (
                <>
                  <RateSparkline points={data.history} locale={locale} currency={data.target} />
                  <div className="exchange-rate-range">
                    <span>{t("trip.rate.low", { rate: formatRate(trend.minimum, locale) })}</span>
                    <span>{t("trip.rate.high", { rate: formatRate(trend.maximum, locale) })}</span>
                  </div>
                </>
              ) : (
                <div className="exchange-rate-history-empty">{t("trip.rate.noHistory")}</div>
              )}
            </div>
          </div>

          <p className="exchange-rate-disclaimer">{t("trip.rate.disclaimer")}</p>
        </>
      ) : null}
      </section>

      <Dialog.Root open={mobileOpen} onOpenChange={setMobileOpen}>
        <Dialog.Trigger asChild>
          <button
            type="button"
            className="exchange-rate-mobile-trigger"
            aria-label={t("trip.rate.openCalculator")}
            title={t("trip.rate.openCalculator")}
          >
            <Calculator size={22} aria-hidden="true" />
          </button>
        </Dialog.Trigger>

        <Dialog.Portal>
          <Dialog.Overlay className="exchange-rate-mobile-overlay" />
          <Dialog.Content className="exchange-rate-mobile-dialog">
            <header className="exchange-rate-mobile-header">
              <div className="exchange-rate-mobile-header-title">
                <Calculator size={19} aria-hidden="true" />
                <Dialog.Title>{t("trip.rate.calculator")}</Dialog.Title>
              </div>
              <div className="exchange-rate-mobile-header-actions">
                <Dialog.Root>
                  <Dialog.Trigger asChild>
                    <button type="button" aria-label={t("trip.rate.openHistory")}>
                      <TrendingUp size={21} aria-hidden="true" />
                    </button>
                  </Dialog.Trigger>
                  <Dialog.Portal>
                    <Dialog.Overlay className="exchange-rate-history-overlay" />
                    <Dialog.Content className="exchange-rate-history-dialog">
                      <header>
                        <Dialog.Title>
                          <TrendingUp size={20} aria-hidden="true" />
                          {t("trip.rate.historyShort")}
                        </Dialog.Title>
                        <Dialog.Close asChild>
                          <button type="button" aria-label={t("trip.rate.closeHistory")}>
                            <X size={21} aria-hidden="true" />
                          </button>
                        </Dialog.Close>
                      </header>
                      <Dialog.Description className="exchange-rate-visually-hidden">
                        {t("trip.rate.subtitle")}
                      </Dialog.Description>

                      <div className="exchange-rate-history-dialog-body">
                        {loading ? (
                          <div className="exchange-rate-history-dialog-state">
                            <Loader2 size={19} className="exchange-rate-spinner" aria-hidden="true" />
                            {t("trip.rate.loading")}
                          </div>
                        ) : error ? (
                          <div className="exchange-rate-history-dialog-state">
                            <span>{t("trip.rate.error")}</span>
                            <button type="button" onClick={retryRate}>
                              <RefreshCw size={15} aria-hidden="true" />
                              {t("trip.rate.retry")}
                            </button>
                          </div>
                        ) : data && data.history.length >= 2 && trend ? (
                          <>
                            <div className="exchange-rate-history-dialog-summary">
                              <span>{`${formatShortDate(data.history[0].date)}–${formatShortDate(data.history[data.history.length - 1].date)}`}</span>
                              <strong>
                                {trend.changePercent >= 0
                                  ? <ArrowUpRight size={17} aria-hidden="true" />
                                  : <ArrowDownRight size={17} aria-hidden="true" />}
                                {t("trip.rate.change", {
                                  change: `${trend.changePercent >= 0 ? "+" : ""}${trend.changePercent.toFixed(2)}%`,
                                })}
                              </strong>
                            </div>
                            <RateSparkline points={data.history} locale={locale} currency={data.target} />
                            <div className="exchange-rate-range">
                              <span>{t("trip.rate.low", { rate: formatRate(trend.minimum, locale) })}</span>
                              <span>{t("trip.rate.high", { rate: formatRate(trend.maximum, locale) })}</span>
                            </div>
                          </>
                        ) : (
                          <div className="exchange-rate-history-dialog-state">{t("trip.rate.noHistory")}</div>
                        )}
                      </div>

                      <footer>
                        {data && <span>{`1 ${data.base} ≈ ${formatHeadlineRate(data.rate, locale)} ${data.target}`}</span>}
                        {sourceMeta && (
                          <a href={sourceMeta.href} target="_blank" rel="noreferrer">
                            {t("trip.rate.source", { source: sourceMeta.label })}
                          </a>
                        )}
                      </footer>
                    </Dialog.Content>
                  </Dialog.Portal>
                </Dialog.Root>

                <Dialog.Close asChild>
                  <button type="button" aria-label={t("trip.rate.closeCalculator")}>
                    <X size={22} aria-hidden="true" />
                  </button>
                </Dialog.Close>
              </div>
            </header>

            <Dialog.Description className="exchange-rate-visually-hidden">
              {`${t("trip.rate.subtitle")} ${t("trip.rate.disclaimer")}`}
            </Dialog.Description>

            <div className="exchange-rate-mobile-workspace">
              <MobileExchangeCalculator
                amount={amount}
                convertedAmount={convertedAmount}
                currencyOptions={currencyOptions}
                data={data}
                error={error}
                fromCurrency={fromCurrency}
                loading={loading}
                locale={locale}
                onAmountChange={setAmount}
                onChangePair={changePair}
                onRetry={retryRate}
                onSwap={swapCurrencies}
                toCurrency={toCurrency}
                t={t}
              />
            </div>

            <footer className="exchange-rate-mobile-footer">
              <span>{t("trip.rate.estimateOnly")}</span>
              {sourceMeta && (
                <a href={sourceMeta.href} target="_blank" rel="noreferrer">
                  {t("trip.rate.source", { source: sourceMeta.label })}
                </a>
              )}
            </footer>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  )
}
