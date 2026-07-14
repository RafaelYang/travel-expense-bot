/**
 * 行程主頁 — 預算追蹤 + 記帳 + 花費列表
 *
 * 這是整個 App 最重要的頁面：
 * - 預算進度條動畫（核心視覺效果）
 * - 快速記帳表單
 * - 今日花費列表
 * - 花費分類統計
 */
"use client"

import { useEffect, useState, useRef, useCallback, useSyncExternalStore } from "react"
import { useRouter } from "next/navigation"
import { Navbar } from "@/components/navbar"
import { BudgetProgress } from "@/components/budget-progress"
import {
  ArrowLeft, PlusCircle, Wallet, Users, Calendar, Settings,
  ChevronDown, ChevronUp, Loader2, Trash2, X, Check,
  Send, Share2, ImagePlus, BarChart3, Pencil, Plane,
} from "lucide-react"
import Link from "next/link"
import { format, differenceInDays } from "date-fns"
import { zhTW, enUS } from "date-fns/locale"
import { useLanguage } from "@/components/language-provider"
import {
  EXPENSE_CATEGORIES, getCategoryInfo, getCurrencySymbol,
} from "@/lib/utils"
import { getCurrenciesFromCountries, ALL_CURRENCIES, getCurrencyChipLabel, extractCleanCountries } from "@/lib/countries"
import { getExpenseBaseAmount } from "@/lib/money"

export interface TripData {
  id: string
  name: string
  description?: string
  startDate: string
  endDate: string
  defaultCurrency: string
  baseCurrency: string
  countries: string[]
  budgetAmount?: number
  status: string
  realtimeVersion: string
  totalSpent: number
  totalDeposits: number
  missingConversionCount?: number
  foreignCurrencyDepositCount?: number
  userRole: string
  members: {
    id: string
    role: string
    user: { id: string; name: string; email: string; image?: string }
  }[]
  expenses: {
    id: string
    category: string
    item: string
    amount: number
    currency: string
    convertedAmount?: number
    exchangeRate?: number
    date: string
    note?: string
    images?: string[]
    source: string
    user: { id: string; name: string }
  }[]
  deposits: {
    id: string
    amount: number
    currency: string
    note?: string
    createdAt: string
    user: { id: string; name: string }
  }[]
}

type ExpenseDisplayTransaction = TripData["expenses"][number] & { isIncome: false }
type DepositDisplayTransaction = {
  id: string
  isIncome: true
  category: "income"
  item: string
  amount: number
  currency: string
  convertedAmount?: number
  date: string
  note?: undefined
  user: TripData["deposits"][number]["user"]
  source: "web"
}
type DisplayTransaction = ExpenseDisplayTransaction | DepositDisplayTransaction
type CreatedTransaction =
  | { kind: "expense"; record: TripData["expenses"][number] }
  | { kind: "deposit"; record: TripData["deposits"][number] }

const PREFERRED_CURRENCY_EVENT = "travel-expense-currency-change"

function getPreferredCurrencySnapshot() {
  const saved = localStorage.getItem("preferredCurrency")
  return saved && ALL_CURRENCIES[saved] ? saved : "TWD"
}

function subscribePreferredCurrency(onStoreChange: () => void) {
  window.addEventListener("storage", onStoreChange)
  window.addEventListener(PREFERRED_CURRENCY_EVENT, onStoreChange)
  return () => {
    window.removeEventListener("storage", onStoreChange)
    window.removeEventListener(PREFERRED_CURRENCY_EVENT, onStoreChange)
  }
}

function getLocalDateTimeInputValue() {
  const now = new Date()
  const timezoneOffset = now.getTimezoneOffset() * 60_000
  return new Date(now.getTime() - timezoneOffset).toISOString().slice(0, 16)
}

export default function TripDetailClient({ initialData, tripId }: { initialData: TripData; tripId: string }) {
  const router = useRouter()
  const [trip, setTrip] = useState<TripData>(initialData)
  const realtimeVersionRef = useRef(initialData.realtimeVersion)
  const [loading, setLoading] = useState(false)
  const [showExpenseForm, setShowExpenseForm] = useState(false)
  const [showAllExpenses, setShowAllExpenses] = useState(false)
  const [showMemberList, setShowMemberList] = useState(false)
  const [showShareModal, setShowShareModal] = useState(false)
  const [showStatsModal, setShowStatsModal] = useState(false)
  const [editingExpense, setEditingExpense] = useState<TripData['expenses'][0] | null>(null)
  const [editingDeposit, setEditingDeposit] = useState<DepositDisplayTransaction | null>(null)
  const [gmailPrefix, setGmailPrefix] = useState('')
  const [inviteSending, setInviteSending] = useState(false)
  const [inviteStatus, setInviteStatus] = useState<'idle' | 'sent' | 'error'>('idle')
  const [inviteError, setInviteError] = useState('')
  // autocomplete 建議
  const [suggestions, setSuggestions] = useState<{id:string;name:string|null;email:string|null;image:string|null}[]>([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const suggestionsTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inputWrapperRef = useRef<HTMLDivElement>(null)

  // debounce 搜尋使用者
  const searchUsers = useCallback((prefix: string) => {
    if (suggestionsTimer.current) clearTimeout(suggestionsTimer.current)
    if (prefix.length < 3) {
      setSuggestions([])
      setShowSuggestions(false)
      return
    }
    suggestionsTimer.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/users/search?q=${encodeURIComponent(prefix)}`)
        const data = await res.json()
        setSuggestions(data.users || [])
        setShowSuggestions((data.users || []).length > 0)
      } catch {
        setSuggestions([])
      }
    }, 300)
  }, [])

  // 點擊外部關閉建議
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (inputWrapperRef.current && !inputWrapperRef.current.contains(e.target as Node)) {
        setShowSuggestions(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])
  const { t, locale } = useLanguage()
  const dateLocale = locale === 'en' ? enUS : zhTW

  const fetchTrip = useCallback(async (redirectOnError = true) => {
    try {
      const res = await fetch(`/api/trips/${tripId}?t=${Date.now()}`, { cache: 'no-store' })
      if (!res.ok) {
        if (redirectOnError && (res.status === 403 || res.status === 404)) {
          router.push("/")
        }
        return
      }
      const data = await res.json()
      if (typeof data.realtimeVersion === 'string') {
        realtimeVersionRef.current = data.realtimeVersion
      }
      setTrip(data)
    } catch {
      if (redirectOnError) {
        router.push("/")
      }
    } finally {
      setLoading(false)
    }
  }, [router, tripId])

  const readRealtimeVersion = useCallback(async () => {
    const res = await fetch(`/api/trips/${tripId}/version`, { cache: 'no-store' })
    if (!res.ok) {
      if (res.status === 403 || res.status === 404) router.push("/")
      return null
    }
    const data = await res.json()
    return typeof data.version === 'string' ? data.version : null
  }, [router, tripId])

  const syncRealtimeBaseline = useCallback(async () => {
    try {
      const version = await readRealtimeVersion()
      if (version) realtimeVersionRef.current = version
    } catch {
      // 同步版本失敗不影響已完成的本地操作，下一輪輪詢會自動修正。
    }
  }, [readRealtimeVersion])

  useEffect(() => {
    let stopped = false
    let checking = false

    const checkForRemoteChanges = async () => {
      if (stopped || checking || document.visibilityState === 'hidden') return
      checking = true
      try {
        const version = await readRealtimeVersion()
        if (!version || stopped || version === realtimeVersionRef.current) return

        realtimeVersionRef.current = version
        await fetchTrip(false)
      } catch {
        // 暫時離線或背景請求失敗時保持目前畫面，下一輪再重試。
      } finally {
        checking = false
      }
    }

    const interval = window.setInterval(checkForRemoteChanges, 5_000)
    const checkWhenVisible = () => {
      if (document.visibilityState === 'visible') void checkForRemoteChanges()
    }

    document.addEventListener('visibilitychange', checkWhenVisible)
    window.addEventListener('focus', checkWhenVisible)

    return () => {
      stopped = true
      window.clearInterval(interval)
      document.removeEventListener('visibilitychange', checkWhenVisible)
      window.removeEventListener('focus', checkWhenVisible)
    }
  }, [fetchTrip, readRealtimeVersion])

  const handleCreatedTransaction = useCallback((created: CreatedTransaction) => {
    setTrip((current) => {
      if (created.kind === "expense") {
        const baseAmount = getExpenseBaseAmount(created.record, current.baseCurrency)
        return {
          ...current,
          expenses: [created.record, ...current.expenses],
          totalSpent: current.totalSpent + (baseAmount ?? 0),
          missingConversionCount:
            (current.missingConversionCount ?? 0) + (baseAmount === null ? 1 : 0),
        }
      }

      const isBaseCurrency = created.record.currency.toUpperCase() === current.baseCurrency.toUpperCase()
      return {
        ...current,
        deposits: [created.record, ...current.deposits],
        totalDeposits: current.totalDeposits + (isBaseCurrency ? created.record.amount : 0),
        foreignCurrencyDepositCount:
          (current.foreignCurrencyDepositCount ?? 0) + (isBaseCurrency ? 0 : 1),
      }
    })
    setShowExpenseForm(false)
    void syncRealtimeBaseline()
  }, [syncRealtimeBaseline])

  if (loading || !trip) {
    return (
      <div style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'var(--bg-primary)',
      }}>
        <Plane
          size={48}
          style={{
            color: 'var(--color-primary)',
            animation: 'planeFly 2s ease-in-out infinite',
            filter: 'drop-shadow(0 4px 12px rgba(14,165,233,0.3))',
          }}
        />
        <style>{`
          @keyframes planeFly {
            0%, 100% { transform: translateY(0) rotate(-5deg); }
            50% { transform: translateY(-12px) rotate(-5deg); }
          }
        `}</style>
      </div>
    )
  }

  const totalDays = differenceInDays(new Date(trip.endDate), new Date(trip.startDate)) + 1

  // 產生每日花費折線圖數據
  const chartDays: { label: string; dateStr: string; amount: number }[] = []
  try {
    const dateSet = new Set<string>()

    // 1. 放入行程期間的每一天
    const start = new Date(trip.startDate)
    const end = new Date(trip.endDate)
    const current = new Date(start)
    let count = 0
    while (current <= end && count < 31) {
      const yyyy = current.getFullYear()
      const mm = String(current.getMonth() + 1).padStart(2, '0')
      const dd = String(current.getDate()).padStart(2, '0')
      dateSet.add(`${yyyy}-${mm}-${dd}`)
      current.setDate(current.getDate() + 1)
      count++
    }

    // 2. 放入行程外有記帳消費的日期 (例如提前訂的機票)
    trip.expenses.forEach(e => {
      try {
        const eDate = new Date(e.date)
        const yyyy = eDate.getFullYear()
        const mm = String(eDate.getMonth() + 1).padStart(2, '0')
        const dd = String(eDate.getDate()).padStart(2, '0')
        dateSet.add(`${yyyy}-${mm}-${dd}`)
      } catch {}
    })

    // 3. 排序日期字串 (保證時間軸從小到大)
    const sortedDateStrs = Array.from(dateSet).sort()

    // 4. 計算每日消費總額
    sortedDateStrs.forEach(dateStr => {
      const parts = dateStr.split('-')
      const m = parseInt(parts[1])
      const d = parseInt(parts[2])
      const label = `${m}/${d}`

      const dayAmount = trip.expenses
        .filter(e => {
          const eDate = new Date(e.date)
          const ey = eDate.getFullYear()
          const em = String(eDate.getMonth() + 1).padStart(2, '0')
          const ed = String(eDate.getDate()).padStart(2, '0')
          return `${ey}-${em}-${ed}` === dateStr
        })
        .reduce(
          (sum, expense) => sum + (getExpenseBaseAmount(expense, trip.baseCurrency) ?? 0),
          0,
        )

      chartDays.push({ label, dateStr, amount: Math.round(dayAmount) })
    })
  } catch (err) {
    console.error("Chart data error:", err)
  }

  const maxChartAmount = Math.max(...chartDays.map(d => d.amount), 1000)
  const chartPoints = chartDays.map((d, i) => {
    const x = chartDays.length > 1
      ? 20 + (i / (chartDays.length - 1)) * 320
      : 180
    const y = 90 - (d.amount / maxChartAmount) * 70
    return { x, y, amount: d.amount, label: d.label }
  })

  const chartLinePath = chartPoints.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')
  const chartAreaPath = chartPoints.length > 0 ? `${chartLinePath} L ${chartPoints[chartPoints.length - 1].x} 90 L ${chartPoints[0].x} 90 Z` : ''
  const daysPassed = Math.max(0, differenceInDays(new Date(), new Date(trip.startDate)) + 1)
  const budget = trip.budgetAmount || 0
  const canEdit = trip.userRole !== 'viewer'

  // 分類統計
  const categoryStats = EXPENSE_CATEGORIES.map(cat => {
    const expenses = trip.expenses.filter(e => e.category === cat.value)
    const total = expenses.reduce(
      (sum, expense) => sum + (getExpenseBaseAmount(expense, trip.baseCurrency) ?? 0),
      0,
    )
    return { ...cat, label: t(`cat.${cat.value}`), total, count: expenses.length }
  }).filter(c => c.count > 0).sort((a, b) => b.total - a.total)

  // 合併支出與收入並依時間倒序
  const parsedExpenses: ExpenseDisplayTransaction[] = trip.expenses.map(e => ({
    id: e.id,
    isIncome: false,
    category: e.category,
    item: e.item,
    amount: e.amount,
    currency: e.currency,
    convertedAmount: e.convertedAmount,
    date: e.date,
    note: e.note,
    images: e.images,
    user: e.user,
    source: e.source,
  }))

  const parsedDeposits: DepositDisplayTransaction[] = trip.deposits.map(d => ({
    id: d.id,
    isIncome: true,
    category: 'income',
    item: d.note || t('form.tab.income'),
    amount: d.amount,
    currency: d.currency,
    convertedAmount: d.currency === trip.baseCurrency ? d.amount : undefined,
    date: d.createdAt,
    note: undefined,
    user: d.user,
    source: 'web',
  }))

  const allTransactions = [...parsedExpenses, ...parsedDeposits].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  )

  const displayTransactions = showAllExpenses ? allTransactions : allTransactions.slice(0, 10)

  // 依日期分組
  const tripStart = new Date(trip.startDate)
  const tripEnd = new Date(trip.endDate)

  const getDayLabel = (dateStr: string) => {
    try {
      const d = new Date(dateStr)
      const dZero = new Date(d.getFullYear(), d.getMonth(), d.getDate())
      const sZero = new Date(tripStart.getFullYear(), tripStart.getMonth(), tripStart.getDate())
      const eZero = new Date(tripEnd.getFullYear(), tripEnd.getMonth(), tripEnd.getDate())
      if (dZero >= sZero && dZero <= eZero) {
        const diff = differenceInDays(dZero, sZero) + 1
        return `Day ${diff}`
      }
    } catch {}
    return null
  }

  const groupedExpenses: {
    dateStr: string
    dayLabel: string | null
    weekday: string
    expenses: typeof displayTransactions
  }[] = []

  displayTransactions.forEach(tx => {
    const d = new Date(tx.date)
    const dateStr = format(d, 'yyyy/M/d')
    const weekday = format(d, 'eee', { locale: locale === 'en' ? enUS : zhTW })
    let group = groupedExpenses.find(g => g.dateStr === dateStr)
    if (!group) {
      group = {
        dateStr,
        dayLabel: getDayLabel(dateStr),
        weekday: `(${weekday})`,
        expenses: [],
      }
      groupedExpenses.push(group)
    }
    group.expenses.push(tx)
  })

  return (
    <div style={{ minHeight: '100vh', paddingBottom: '6rem' }}>
      <Navbar />

      <main style={{
        maxWidth: '800px',
        margin: '0 auto',
        padding: '1.5rem',
        position: 'relative',
        zIndex: 1,
      }}>
        {/* 返回 + 標題 */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          marginBottom: '1.5rem',
        }}>
          <Link href="/" className="btn-nav">
            <ArrowLeft size={15} />
            {t('trip.back')}
          </Link>
          {trip.userRole === 'owner' && (
            <Link href={`/trips/${tripId}/settings`} className="btn-nav">
              <Settings size={15} />
              {t('trip.settings')}
            </Link>
          )}
        </div>

        {/* 行程標題卡片 */}
        <div className="glass-card animate-fade-in-up" style={{
          padding: '1.5rem',
          marginBottom: '1rem',
          position: 'relative',
          zIndex: showMemberList ? 10 : 'auto',
        }}>
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
            marginBottom: '0.5rem',
          }}>
            <div style={{ flex: 1 }}>
              <h1 style={{
                fontSize: 'clamp(1.25rem, 4vw, 1.75rem)',
                fontWeight: 800,
                letterSpacing: '-0.02em',
              }}>
                {trip.name}
              </h1>
              {trip.description && (
                <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                  {trip.description}
                </p>
              )}
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0 }}>
              <button
                onClick={() => setShowStatsModal(true)}
                style={{
                  padding: '0.5rem', borderRadius: '10px',
                  border: '1px solid var(--border-color)',
                  background: 'rgba(14, 165, 233, 0.06)',
                  color: 'var(--color-primary)',
                  cursor: 'pointer', transition: 'all 0.2s',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
                title="統計"
              >
                <BarChart3 size={18} />
              </button>
              {canEdit && (
                <button
                  onClick={() => { setShowShareModal(true); setInviteStatus('idle'); setGmailPrefix('') }}
                  style={{
                    padding: '0.5rem', borderRadius: '10px',
                    border: '1px solid var(--border-color)',
                    background: 'rgba(14, 165, 233, 0.06)',
                    color: 'var(--color-primary)',
                    cursor: 'pointer', transition: 'all 0.2s',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}
                  title={t('trip.invite')}
                >
                  <Share2 size={18} />
                </button>
              )}
            </div>
          </div>

          <div style={{
            display: 'flex', gap: '1rem', flexWrap: 'wrap',
            fontSize: '0.8rem', color: 'var(--text-secondary)',
          }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
              <Calendar size={13} />
              {format(new Date(trip.startDate), 'yyyy/M/d', { locale: dateLocale })} - {format(new Date(trip.endDate), 'M/d', { locale: dateLocale })}
              （{totalDays} {t('trip.days')}）
            </span>
            <span
              onClick={() => setShowMemberList(!showMemberList)}
              style={{
                display: 'flex', alignItems: 'center', gap: '0.25rem',
                cursor: 'pointer', borderRadius: '6px',
                padding: '0.15rem 0.5rem', marginLeft: '-0.5rem',
                background: showMemberList ? 'rgba(14, 165, 233, 0.1)' : 'transparent',
                transition: 'background 0.15s',
                position: 'relative',
              }}
            >
              <Users size={13} />
              {t('home.members', { count: String(trip.members.length) })}

              {/* 成員列表 Popup */}
              {showMemberList && (
                <div
                  onClick={(e) => e.stopPropagation()}
                  style={{
                    position: 'absolute', top: 'calc(100% + 8px)', left: 0,
                    minWidth: '240px',
                    background: 'var(--dropdown-bg)',
                    backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '12px',
                    boxShadow: '0 10px 40px rgba(0,0,0,0.2)',
                    padding: '0.5rem',
                    zIndex: 60,
                    animation: 'fadeInDown 0.15s ease-out',
                  }}
                >
                  {trip.members.map(member => (
                    <div key={member.id} style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '0.5rem 0.625rem',
                      borderRadius: '8px',
                      transition: 'background 0.15s',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        {member.user.image ? (
                          <img src={member.user.image} alt={member.user.name || ''} style={{
                            width: '28px', height: '28px', borderRadius: '50%', objectFit: 'cover',
                            border: '2px solid rgba(14, 165, 233, 0.3)', flexShrink: 0,
                          }} />
                        ) : (
                          <div style={{
                            width: '28px', height: '28px', borderRadius: '50%',
                            background: 'linear-gradient(135deg, var(--color-primary), var(--color-accent))',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: '0.75rem', fontWeight: 700, color: 'white', flexShrink: 0,
                          }}>
                            {(member.user.name || member.user.email)?.[0]?.toUpperCase()}
                          </div>
                        )}
                        <span style={{ fontSize: '0.8rem', fontWeight: 500, color: 'var(--text-primary)' }}>
                          {member.user.name || member.user.email}
                        </span>
                      </div>
                      <span style={{
                        fontSize: '0.65rem', padding: '0.1rem 0.4rem',
                        borderRadius: '9999px',
                        background: member.role === 'owner' ? 'rgba(217, 119, 6, 0.15)' : 'rgba(100, 116, 139, 0.15)',
                        color: member.role === 'owner' ? '#d97706' : 'var(--text-muted)',
                        fontWeight: 500,
                      }}>
                        {member.role === 'owner' ? t('trip.role.owner') : member.role === 'viewer' ? t('trip.role.viewer') : t('trip.role.member')}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </span>
            {trip.status === 'active' && (
              <span style={{ color: 'var(--color-primary)', fontWeight: 600 }}>
                Day {Math.min(daysPassed, totalDays)} / {totalDays}
              </span>
            )}
          </div>
        </div>



        {/* 預算進度條已移至統計 Modal */}

        {/* 快速記帳按鈕 */}
        {canEdit && (
          <div className="animate-fade-in-up animate-delay-200" style={{ marginBottom: '1rem' }}>
            <button
              onClick={() => setShowExpenseForm(!showExpenseForm)}
              className="btn-primary"
              style={{
                width: '100%', justifyContent: 'center', padding: '0.75rem',
                background: showExpenseForm
                  ? 'linear-gradient(135deg, var(--color-primary-dark), var(--color-primary))'
                  : undefined,
              }}
            >
              <PlusCircle size={18} />
              {t('trip.addExpense')}
            </button>
          </div>
        )}

        {/* 記帳表單（含收入） */}
        {showExpenseForm && (
          <ExpenseForm
            tripId={tripId}
            defaultCurrency={trip.defaultCurrency}
            baseCurrency={trip.baseCurrency}
            countries={trip.countries}
            onClose={() => setShowExpenseForm(false)}
            onSubmit={handleCreatedTransaction}
          />
        )}

        {/* 全部花費列表 */}
        {allTransactions.length > 0 && (
          <div className="glass-card" style={{
            padding: '1.25rem',
            marginBottom: '1rem',
          }}>
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              marginBottom: '0.75rem',
            }}>
              <h3 style={{ fontSize: '0.9rem', fontWeight: 700 }}>
                {t('trip.allExpenses', { count: String(allTransactions.length) })}
              </h3>
              <span style={{
                fontSize: '1rem', fontWeight: 700, color: 'var(--color-primary-light)',
              }}>
                {getCurrencySymbol(trip.baseCurrency)}{trip.totalSpent.toLocaleString()}
              </span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              {groupedExpenses.map(group => (
                <div key={group.dateStr} style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
                  {/* 日期分組 Header */}
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: '0.375rem',
                    fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-secondary)',
                    paddingLeft: '0.25rem',
                  }}>
                    <Calendar size={13} style={{ color: 'var(--color-primary)' }} />
                    <span>{group.dateStr}</span>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{group.weekday}</span>
                    {group.dayLabel && (
                      <span style={{
                        padding: '0.1rem 0.4rem', borderRadius: '4px',
                        background: 'rgba(14, 165, 233, 0.1)',
                        color: 'var(--color-primary)',
                        fontSize: '0.68rem', fontWeight: 600,
                        marginLeft: '0.25rem',
                      }}>
                        {group.dayLabel}
                      </span>
                    )}
                  </div>

                  {/* 該日的所有消費 */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {group.expenses.map(expense => (
                      <ExpenseRow
                        key={expense.id}
                        expense={expense}
                        currency={trip.baseCurrency}
                        onEdit={
                          !canEdit
                            ? undefined
                            : expense.isIncome
                            ? () => setEditingDeposit(expense)
                            : () => setEditingExpense(expense)
                        }
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
            {allTransactions.length > 10 && (
              <button
                onClick={() => setShowAllExpenses(!showAllExpenses)}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  gap: '0.25rem', width: '100%', padding: '0.5rem',
                  marginTop: '0.75rem', background: 'none', border: 'none',
                  color: 'var(--color-primary)', fontSize: '0.8rem', fontWeight: 500,
                  cursor: 'pointer',
                }}
              >
                {showAllExpenses ? (
                  <><ChevronUp size={16} />{t('trip.collapse')}</>
                ) : (
                  <><ChevronDown size={16} />{t('trip.showAll', { count: String(allTransactions.length) })}</>
                )}
              </button>
            )}
          </div>
        )}


      </main>

      {/* 編輯花費 Modal */}
      {editingExpense && (
        <EditExpenseModal
          expense={editingExpense}
          tripId={tripId}
          defaultCurrency={trip.defaultCurrency}
          countries={trip.countries}
          onClose={() => setEditingExpense(null)}
          onSave={() => { setEditingExpense(null); fetchTrip() }}
        />
      )}

      {/* 編輯收入 Modal */}
      {editingDeposit && (
        <EditDepositModal
          deposit={editingDeposit}
          tripId={tripId}
          defaultCurrency={trip.defaultCurrency}
          countries={trip.countries}
          onClose={() => setEditingDeposit(null)}
          onSave={() => { setEditingDeposit(null); fetchTrip() }}
        />
      )}

      {/* 分享邀請 Modal */}
      {showShareModal && (
        <div
          onClick={() => setShowShareModal(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 20000,
            background: 'rgba(0, 0, 0, 0.5)',
            backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 'calc(3.5rem + env(safe-area-inset-top)) 1.5rem 1.5rem 1.5rem',
            animation: 'fadeIn 0.15s ease-out',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="glass-card trip-modal"
            style={{
              width: '100%', maxWidth: '380px', padding: '1.75rem',
              animation: 'fadeInDown 0.2s ease-out',
              maxHeight: '80vh', display: 'flex', flexDirection: 'column',
              overflow: 'hidden',
            }}
          >
            {/* Header */}
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              marginBottom: '1.25rem', flexShrink: 0
            }}>
              <h3 style={{
                fontSize: '1rem', fontWeight: 700,
                display: 'flex', alignItems: 'center', gap: '0.5rem',
              }}>
                <Share2 size={18} style={{ color: 'var(--color-primary)' }} />
                {t('trip.invite')}
              </h3>
              <button
                onClick={() => setShowShareModal(false)}
                style={{
                  padding: '0.25rem', borderRadius: '6px', border: 'none',
                  background: 'transparent', color: 'var(--text-muted)',
                  cursor: 'pointer',
                }}
              >
                <X size={18} />
              </button>
            </div>

            {/* 內容 (可滾動) */}
            <div style={{ overflowY: 'auto', flex: 1, paddingRight: '0.25rem' }}>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '1rem', lineHeight: 1.5 }}>
                {t('settings.emailInvite.desc')}
              </p>

              {/* Gmail 輸入表單 */}
              <form onSubmit={async (e) => {
                e.preventDefault()
                const prefix = gmailPrefix.trim()
                if (!prefix) return
                const fullEmail = `${prefix}@gmail.com`
                setInviteSending(true)
                setInviteStatus('idle')
                setInviteError('')
                try {
                  const res = await fetch(`/api/trips/${tripId}/invite-email`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email: fullEmail }),
                  })
                  const data = await res.json()
                  if (res.ok) {
                    setInviteStatus('sent')
                    setGmailPrefix('')
                  } else {
                    setInviteStatus('error')
                    setInviteError(data.error || '寄送失敗')
                  }
                } catch {
                  setInviteStatus('error')
                  setInviteError('寄送失敗')
                } finally {
                  setInviteSending(false)
                }
              }}>
                <div ref={inputWrapperRef} style={{ position: 'relative', marginBottom: '0.75rem' }}>
                  <div style={{
                    display: 'flex', alignItems: 'center',
                    borderRadius: showSuggestions ? 'var(--radius) var(--radius) 0 0' : 'var(--radius)',
                    border: '1px solid var(--border-color)',
                    background: 'var(--bg-secondary)',
                    overflow: 'hidden',
                  }}>
                    <input
                      type="text"
                      value={gmailPrefix}
                      onChange={(e) => {
                        const v = e.target.value.replace(/[^a-zA-Z0-9._+-]/g, '')
                        setGmailPrefix(v)
                        setInviteStatus('idle')
                        searchUsers(v)
                      }}
                      onFocus={() => { if (suggestions.length > 0) setShowSuggestions(true) }}
                      placeholder={t('trip.invite.gmailPlaceholder')}
                      required
                      autoFocus
                      autoComplete="off"
                      style={{
                        flex: 1, padding: '0.75rem 0.875rem',
                        border: 'none', outline: 'none',
                        background: 'transparent',
                        color: 'var(--text-primary)',
                        fontSize: '0.95rem',
                        fontFamily: 'monospace',
                      }}
                    />
                    <span style={{
                      padding: '0.75rem 0.875rem 0.75rem 0',
                      fontSize: '0.95rem', fontFamily: 'monospace',
                      color: 'var(--text-muted)',
                      whiteSpace: 'nowrap', userSelect: 'none',
                    }}>
                      @gmail.com
                    </span>
                  </div>

                  {/* Autocomplete 建議列表 */}
                  {showSuggestions && suggestions.length > 0 && (
                    <div style={{
                      position: 'absolute', top: '100%', left: 0, right: 0,
                      background: 'var(--bg-secondary)',
                      border: '1px solid var(--border-color)',
                      borderTop: 'none',
                      borderRadius: '0 0 var(--radius) var(--radius)',
                      overflow: 'hidden',
                      zIndex: 50,
                      boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                    }}>
                      {suggestions.map((user) => {
                        const emailPrefix = user.email?.split('@')[0] || ''
                        return (
                          <button
                            key={user.id}
                            type="button"
                            onClick={() => {
                              setGmailPrefix(emailPrefix)
                              setShowSuggestions(false)
                              setSuggestions([])
                            }}
                            style={{
                              width: '100%', display: 'flex', alignItems: 'center', gap: '0.625rem',
                              padding: '0.625rem 0.875rem',
                              border: 'none', background: 'transparent',
                              cursor: 'pointer', textAlign: 'left',
                              transition: 'background 0.15s',
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-hover, rgba(0,0,0,0.04))'}
                            onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                          >
                            {/* 頭像 */}
                            {user.image ? (
                              <img
                                src={user.image}
                                alt=""
                                style={{
                                  width: 32, height: 32, borderRadius: '50%',
                                  objectFit: 'cover',
                                }}
                              />
                            ) : (
                              <div style={{
                                width: 32, height: 32, borderRadius: '50%',
                                background: 'var(--color-primary)',
                                color: '#fff', display: 'flex',
                                alignItems: 'center', justifyContent: 'center',
                                fontSize: '0.75rem', fontWeight: 700,
                              }}>
                                {(user.name || user.email || '?')[0].toUpperCase()}
                              </div>
                            )}
                            <div style={{ minWidth: 0, flex: 1 }}>
                              {user.name && (
                                <div style={{
                                  fontSize: '0.85rem', fontWeight: 600,
                                  color: 'var(--text-primary)',
                                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                }}>{user.name}</div>
                              )}
                              <div style={{
                                fontSize: '0.75rem', color: 'var(--text-muted)',
                                fontFamily: 'monospace',
                                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                              }}>{user.email}</div>
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>

                <button
                  type="submit"
                  className="btn-primary"
                  disabled={inviteSending || !gmailPrefix.trim()}
                  style={{
                    width: '100%', justifyContent: 'center',
                    opacity: (inviteSending || !gmailPrefix.trim()) ? 0.6 : 1,
                    padding: '0.75rem',
                  }}
                >
                  {inviteSending ? (
                    <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
                  ) : (
                    <><Send size={16} /> {t('settings.emailInvite.send')}</>
                  )}
                </button>
              </form>

              {/* 成功/錯誤提示 */}
              {inviteStatus === 'sent' && (
                <div style={{
                  marginTop: '0.75rem', padding: '0.625rem 0.875rem',
                  borderRadius: 'var(--radius)',
                  background: 'rgba(34, 197, 94, 0.1)',
                  border: '1px solid rgba(34, 197, 94, 0.2)',
                  color: 'var(--color-success)',
                  fontSize: '0.8rem', fontWeight: 500,
                  display: 'flex', alignItems: 'center', gap: '0.375rem',
                }}>
                  <Check size={16} />
                  {t('settings.emailInvite.sent')}
                </div>
              )}
              {inviteStatus === 'error' && (
                <div style={{
                  marginTop: '0.75rem', padding: '0.625rem 0.875rem',
                  borderRadius: 'var(--radius)',
                  background: 'rgba(239, 68, 68, 0.1)',
                  border: '1px solid rgba(239, 68, 68, 0.2)',
                  color: 'var(--color-danger)',
                  fontSize: '0.8rem', fontWeight: 500,
                }}>
                  {inviteError}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 統計 Modal */}
      {showStatsModal && (
        <div
          onClick={() => setShowStatsModal(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 20000,
            background: 'rgba(0, 0, 0, 0.5)',
            backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 'calc(3.5rem + env(safe-area-inset-top)) 1.5rem 1.5rem 1.5rem',
            animation: 'fadeIn 0.15s ease-out',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="glass-card trip-modal stats-modal"
            style={{
              width: '100%', maxWidth: '420px', padding: '1.75rem',
              animation: 'fadeInDown 0.2s ease-out',
              maxHeight: '80vh', display: 'flex', flexDirection: 'column',
              overflow: 'hidden',
            }}
          >
            {/* Header */}
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              marginBottom: '1.25rem', flexShrink: 0
            }}>
              <h3 style={{
                fontSize: '1rem', fontWeight: 700,
                display: 'flex', alignItems: 'center', gap: '0.5rem',
              }}>
                <BarChart3 size={18} style={{ color: 'var(--color-primary)' }} />
                花費統計
              </h3>
              <button
                onClick={() => setShowStatsModal(false)}
                style={{
                  padding: '0.25rem', borderRadius: '6px', border: 'none',
                  background: 'transparent', color: 'var(--text-muted)',
                  cursor: 'pointer',
                }}
              >
                <X size={18} />
              </button>
            </div>

            {/* 內容 (可滾動) */}
            <div style={{ overflowY: 'auto', flex: 1, paddingRight: '0.25rem' }}>
              {/* 預算進度 */}
              {budget > 0 && (
                <div style={{ marginBottom: '1.25rem' }}>
                  <BudgetProgress
                    totalBudget={budget}
                    totalSpent={trip.totalSpent}
                    currency={trip.baseCurrency}
                  />
                </div>
              )}

              {/* 每日花費趨勢折線圖 */}
              <div style={{ marginBottom: '1.25rem', background: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.04)', borderRadius: '12px', padding: '1rem' }}>
                <h4 style={{ fontSize: '0.85rem', fontWeight: 700, marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                  {t('trip.dailySpendTrend')} ({getCurrencySymbol(trip.baseCurrency)})
                </h4>

                {chartDays.length > 0 ? (
                  <div style={{ position: 'relative', width: '100%' }}>
                    <svg width="100%" height="125" viewBox="0 0 360 125" style={{ overflow: 'visible' }}>
                      <defs>
                        <linearGradient id="chart-grad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#0ea5e9" stopOpacity="0.25" />
                          <stop offset="100%" stopColor="#0ea5e9" stopOpacity="0.0" />
                        </linearGradient>
                      </defs>

                      {/* 網格背景線 */}
                      <line x1="15" y1="20" x2="345" y2="20" stroke="rgba(255,255,255,0.05)" strokeDasharray="3,3" />
                      <line x1="15" y1="55" x2="345" y2="55" stroke="rgba(255,255,255,0.05)" strokeDasharray="3,3" />
                      <line x1="15" y1="90" x2="345" y2="90" stroke="rgba(255,255,255,0.05)" strokeDasharray="3,3" />

                      {/* 陰影填充區域 */}
                      {chartPoints.length > 0 && (
                        <path d={chartAreaPath} fill="url(#chart-grad)" />
                      )}

                      {/* 趨勢折線 */}
                      {chartPoints.length > 0 && (
                        <path
                          d={chartLinePath}
                          fill="none"
                          stroke="#0ea5e9"
                          strokeWidth="2.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      )}

                      {/* 資料點與金額文字 */}
                      {chartPoints.map((p, i) => {
                        const showLabel = chartDays.length <= 10 || i % Math.ceil(chartDays.length / 8) === 0 || i === chartDays.length - 1
                        return (
                          <g key={i}>
                            {/* 金額標籤 (僅大於 0 時顯示) */}
                            {p.amount > 0 && (
                              <text
                                x={p.x}
                                y={p.y - 10}
                                textAnchor="middle"
                                fontSize="11"
                                fill="#38bdf8"
                                fontWeight="700"
                              >
                                {p.amount >= 1000 ? `${(p.amount / 1000).toFixed(1)}k` : p.amount}
                              </text>
                            )}

                            {/* 圓點節點 */}
                            <circle
                              cx={p.x}
                              cy={p.y}
                              r={p.amount > 0 ? "4" : "2"}
                              fill={p.amount > 0 ? "#0ea5e9" : "var(--text-muted)"}
                              stroke={p.amount > 0 ? "#fff" : "none"}
                              strokeWidth="1.5"
                            />

                            {/* 日期 X 軸 Label */}
                            {showLabel && (
                              <text
                                x={p.x}
                                y="112"
                                textAnchor="middle"
                                fontSize="11"
                                fill="var(--text-muted)"
                              >
                                {p.label}
                              </text>
                            )}
                          </g>
                        )
                      })}
                    </svg>
                  </div>
                ) : (
                  <div style={{ height: '100px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                    暫無每日花費數據
                  </div>
                )}
              </div>

              {/* 分類統計 */}
              {categoryStats.length > 0 && (
                <div>
                  <h4 style={{ fontSize: '0.9rem', fontWeight: 700, marginBottom: '0.75rem' }}>
                    {t('trip.categories')}
                  </h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {categoryStats.map(cat => {
                      const percent = trip.totalSpent > 0 ? (cat.total / trip.totalSpent) * 100 : 0
                      return (
                        <div key={cat.value} style={{
                          display: 'flex', alignItems: 'center', gap: '0.75rem',
                        }}>
                          <span style={{ fontSize: '0.85rem', width: '80px' }}>{cat.label}</span>
                          <div style={{
                            flex: 1, height: '8px', borderRadius: '4px',
                            background: 'var(--bg-card-hover)',
                            overflow: 'hidden',
                          }}>
                            <div style={{
                              height: '100%', borderRadius: '4px',
                              background: cat.color,
                              width: `${percent}%`,
                              transition: 'width 1s ease',
                            }} />
                          </div>
                          <span style={{
                            fontSize: '0.8rem', fontWeight: 600,
                            color: 'var(--text-primary)', minWidth: '80px', textAlign: 'right',
                          }}>
                            {getCurrencySymbol(trip.baseCurrency)}{cat.total.toLocaleString()}
                          </span>
                          <span style={{
                            fontSize: '0.7rem', color: 'var(--text-muted)', minWidth: '32px',
                          }}>
                            {t('trip.allExpenses.count', { count: String(cat.count) })}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* 總計 */}
              <div style={{
                marginTop: '1.25rem', paddingTop: '1rem',
                borderTop: '1px solid var(--border-color)',
                display: 'flex', flexDirection: 'column', gap: '0.5rem',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>總花費（{trip.expenses.length} 筆）</span>
                  <span style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                    {getCurrencySymbol(trip.baseCurrency)}{trip.totalSpent.toLocaleString()}
                  </span>
                </div>
                {((trip.missingConversionCount || 0) > 0 || (trip.foreignCurrencyDepositCount || 0) > 0) && (
                  <div style={{
                    padding: '0.6rem 0.75rem', borderRadius: '8px',
                    background: 'rgba(245, 158, 11, 0.1)', color: '#f59e0b',
                    fontSize: '0.75rem', lineHeight: 1.5,
                  }}>
                    {t('trip.total.incomplete', {
                      expenses: String(trip.missingConversionCount || 0),
                      deposits: String(trip.foreignCurrencyDepositCount || 0),
                    })}
                  </div>
                )}
                {trip.totalDeposits > 0 && (
                  <>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '0.85rem', color: '#22c55e' }}>總收入（{trip.deposits.length} 筆）</span>
                      <span style={{ fontSize: '0.95rem', fontWeight: 700, color: '#22c55e' }}>
                        +{getCurrencySymbol(trip.baseCurrency)}{trip.totalDeposits.toLocaleString()}
                      </span>
                    </div>
                    <div style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      paddingTop: '0.5rem', borderTop: '1px dashed var(--border-color)',
                      marginTop: '0.25rem'
                    }}>
                      <span style={{ fontSize: '0.9rem', fontWeight: 600 }}>公積金餘額</span>
                      <span style={{
                        fontSize: '1.1rem', fontWeight: 800,
                        color: (trip.totalDeposits - trip.totalSpent) >= 0 ? '#22c55e' : 'var(--color-danger)',
                      }}>
                        {getCurrencySymbol(trip.baseCurrency)}{(trip.totalDeposits - trip.totalSpent).toLocaleString()}
                      </span>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}

// === 花費列表行 ===
function ExpenseRow({ expense, currency, onEdit }: {
  expense: DisplayTransaction
  currency: string
  onEdit?: () => void
}) {
  const { t } = useLanguage()
  const isIncome = expense.isIncome
  const cat = isIncome
    ? { color: '#22c55e', name: t('form.tab.income') }
    : getCategoryInfo(expense.category)

  // 使用實際幣種而非行程預設幣種
  const displayCurrency = expense.currency || currency
  return (
    <div
      onClick={onEdit}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0.75rem',
        borderRadius: 'var(--radius)',
        background: 'var(--bg-card-hover)',
        transition: 'all 0.2s',
        cursor: onEdit ? 'pointer' : 'default',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flex: 1, minWidth: 0 }}>
        <span className="category-badge" style={{
          background: isIncome ? 'rgba(34, 197, 94, 0.12)' : `${cat.color}18`,
          color: isIncome ? '#22c55e' : cat.color,
          flexShrink: 0,
        }}>
          {isIncome ? t('form.tab.income') : t(`cat.${expense.category}`)}
        </span>
        <div style={{ minWidth: 0 }}>
          <div style={{
            fontSize: '0.85rem', fontWeight: 500,
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>
            {expense.item}
          </div>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
            {expense.user?.name} · {format(new Date(expense.date), 'HH:mm')}
            {!isIncome && expense.source === 'line' && ' · 📱'}
          </div>
        </div>
      </div>
      <div style={{ flexShrink: 0, textAlign: 'right' }}>
          <span style={{
            fontSize: '0.9rem', fontWeight: 700,
            color: isIncome ? '#22c55e' : 'var(--text-primary)',
          }}>
            {isIncome ? '+' : ''}{getCurrencySymbol(displayCurrency)}{expense.amount.toLocaleString()}
          </span>
          {expense.convertedAmount && expense.currency !== currency && (
            <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: '1px' }}>
              ≈ {getCurrencySymbol(currency)}{expense.convertedAmount.toLocaleString()}
            </div>
          )}
      </div>
    </div>
  )
}

// === 記帳表單 ===
function ExpenseForm({ tripId, defaultCurrency, baseCurrency, countries, onClose, onSubmit }: {
  tripId: string
  defaultCurrency: string
  baseCurrency: string
  countries: string[]
  onClose: () => void
  onSubmit: (created: CreatedTransaction) => void
}) {
  // 行程國家對應的幣種（不重複）
  const cleanCountries = extractCleanCountries(countries)
  const tripCurrencies = getCurrenciesFromCountries(cleanCountries)
  // 確保基準幣種也在 chip 裡（例如 TWD）
  const chipCurrencies = [...tripCurrencies]
  if (baseCurrency && !chipCurrencies.includes(baseCurrency)) {
    chipCurrencies.push(baseCurrency)
  }
  // 非 chip 的其他幣種
  const otherCurrencies = Object.keys(ALL_CURRENCIES).filter(c => !chipCurrencies.includes(c))
  const { locale, t } = useLanguage()

  const [mode, setMode] = useState<'expense' | 'deposit'>('expense')
  const [form, setForm] = useState(() => ({
    category: 'food',
    item: '',
    amount: '',
    currency: tripCurrencies[0] || defaultCurrency,
    note: '',
    date: getLocalDateTimeInputValue(),
  }))
  const [images, setImages] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [submitError, setSubmitError] = useState("")
  const [compressing, setCompressing] = useState(false)
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const touchStartX = useRef<number | null>(null)
  const touchEndX = useRef<number | null>(null)

  // 壓縮圖片為 base64（最大寬度 800px，品質 0.6）
  const compressImage = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = (e) => {
        const img = new window.Image()
        img.onload = () => {
          const canvas = document.createElement('canvas')
          const maxW = 800
          let w = img.width, h = img.height
          if (w > maxW) { h = (h * maxW) / w; w = maxW }
          canvas.width = w
          canvas.height = h
          const ctx = canvas.getContext('2d')!
          ctx.drawImage(img, 0, 0, w, h)
          resolve(canvas.toDataURL('image/jpeg', 0.6))
        }
        img.onerror = reject
        img.src = e.target?.result as string
      }
      reader.onerror = reject
      reader.readAsDataURL(file)
    })
  }

  const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    if (files.length === 0) return
    setCompressing(true)
    const remaining = 3 - images.length
    const toProcess = files.slice(0, remaining)
    try {
      const compressed = await Promise.all(toProcess.map(compressImage))
      setImages(prev => [...prev, ...compressed].slice(0, 3))
    } catch (err) {
      console.error("Image compression error:", err)
      alert("圖片處理失敗，請重試")
    } finally {
      setCompressing(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const removeImage = (idx: number) => {
    setImages(prev => prev.filter((_, i) => i !== idx))
  }

  // 即時匯率預覽
  const [ratePreview, setRatePreview] = useState<{ key: string; rate: number; updatedAt: string | null } | null>(null)
  const [loadingRateKey, setLoadingRateKey] = useState<string | null>(null)
  const preferredCur = useSyncExternalStore(
    subscribePreferredCurrency,
    getPreferredCurrencySnapshot,
    () => "TWD",
  )
  const rateKey = `${form.currency}:${preferredCur}:${form.amount}`
  const shouldPreviewRate = form.currency !== preferredCur && Boolean(form.amount)
  const previewRate = shouldPreviewRate && ratePreview?.key === rateKey ? ratePreview.rate : null
  const rateUpdatedAt = shouldPreviewRate && ratePreview?.key === rateKey ? ratePreview.updatedAt : null
  const previewLoading = shouldPreviewRate && loadingRateKey === rateKey

  // 當幣種或金額變動時查詢匯率
  useEffect(() => {
    if (!shouldPreviewRate) return
    let cancelled = false
    const fetchRate = async () => {
      setLoadingRateKey(rateKey)
      try {
        // 走後端 proxy（避免暴露 API key）
        const res = await fetch(`/api/exchange-rate?base=${form.currency}&target=${preferredCur}`)
        if (!res.ok) return
        const data = await res.json()
        if (!cancelled && data.rate) {
          let updatedAt: string | null = null
          if (data.updatedAt) {
            const utcDate = new Date(data.updatedAt)
            updatedAt = new Intl.DateTimeFormat('zh-TW', {
              timeZone: 'Asia/Taipei',
              month: '2-digit', day: '2-digit',
              hour: '2-digit', minute: '2-digit',
              hour12: false,
            }).format(utcDate)
          }
          setRatePreview({ key: rateKey, rate: data.rate, updatedAt })
        }
      } catch { /* 靜默失敗 */ } finally {
        if (!cancelled) {
          setLoadingRateKey((currentKey) => currentKey === rateKey ? null : currentKey)
        }
      }
    }
    // 300ms debounce
    const timer = setTimeout(fetchRate, 300)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [form.currency, preferredCur, rateKey, shouldPreviewRate])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitError("")
    setLoading(true)
    try {
      const url = mode === 'expense'
        ? `/api/trips/${tripId}/expenses`
        : `/api/trips/${tripId}/deposits`
      const body = mode === 'expense'
        ? { ...form, amount: parseFloat(form.amount), date: new Date(form.date).toISOString(), images }
        : { amount: parseFloat(form.amount), currency: form.currency, note: form.item, date: new Date(form.date).toISOString() }
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok || !data) {
        setSubmitError(data?.error || t('form.submit.error'))
        return
      }

      setImages([])
      if (mode === 'expense') {
        onSubmit({
          kind: 'expense',
          record: {
            id: data.id,
            category: data.category,
            item: data.item,
            amount: data.amount,
            currency: data.currency,
            convertedAmount: data.convertedAmount ?? undefined,
            exchangeRate: data.exchangeRate ?? undefined,
            date: data.date,
            note: data.note ?? undefined,
            images: Array.isArray(data.images) ? data.images : [],
            source: data.source,
            user: {
              id: data.user.id,
              name: data.user.name ?? '',
            },
          },
        })
      } else {
        onSubmit({
          kind: 'deposit',
          record: {
            id: data.id,
            amount: data.amount,
            currency: data.currency,
            note: data.note ?? undefined,
            createdAt: data.createdAt,
            user: {
              id: data.user.id,
              name: data.user.name ?? '',
            },
          },
        })
      }
    } catch {
      setSubmitError(t('form.submit.error'))
    } finally {
      setLoading(false)
    }
  }

  const isExpense = mode === 'expense'

  return (
    <div className="glass-card animate-fade-in-up" style={{
      padding: '1.25rem', marginBottom: '1rem',
      border: isExpense ? '1px solid rgba(14, 165, 233, 0.3)' : '1px solid rgba(34, 197, 94, 0.3)',
    }}>
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        marginBottom: '1rem',
      }}>
        {/* 支出/收入 Tab */}
        <div style={{ display: 'flex', gap: '0.25rem', background: 'var(--bg-card-hover)', borderRadius: '8px', padding: '2px' }}>
          <button type="button" onClick={() => { setMode('expense'); setForm(f => ({ ...f, currency: tripCurrencies[0] || defaultCurrency })) }} style={{
            padding: '0.35rem 0.75rem', borderRadius: '6px', border: 'none',
            fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer',
            background: isExpense ? 'var(--color-primary)' : 'transparent',
            color: isExpense ? 'white' : 'var(--text-secondary)',
            transition: 'all 0.2s',
          }}>
            {t('form.tab.expense')}
          </button>
          <button type="button" onClick={() => { setMode('deposit'); setForm(f => ({ ...f, currency: preferredCur })) }} style={{
            padding: '0.35rem 0.75rem', borderRadius: '6px', border: 'none',
            fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer',
            background: !isExpense ? 'var(--color-success)' : 'transparent',
            color: !isExpense ? 'white' : 'var(--text-secondary)',
            transition: 'all 0.2s',
          }}>
            {t('form.tab.income')}
          </button>
        </div>
        <button onClick={onClose} style={{
          background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer',
        }}>
          <X size={18} />
        </button>
      </div>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {/* 分類選擇（僅支出模式）*/}
        {isExpense && (
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            {EXPENSE_CATEGORIES.map(cat => (
              <button
                key={cat.value}
                type="button"
                onClick={() => setForm({ ...form, category: cat.value })}
                style={{
                  padding: '0.375rem 0.75rem', borderRadius: '9999px',
                  fontSize: '0.8rem', cursor: 'pointer',
                  border: form.category === cat.value ? `1.5px solid ${cat.color}` : '1.5px solid transparent',
                  fontWeight: form.category === cat.value ? 600 : 500,
                  background: form.category === cat.value ? `${cat.color}25` : 'var(--bg-card-hover)',
                  color: form.category === cat.value ? cat.color : 'var(--text-secondary)',
                  transition: 'all 0.2s',
                  transform: form.category === cat.value ? 'scale(1.05)' : 'scale(1)',
                  boxShadow: form.category === cat.value ? `0 2px 8px ${cat.color}30` : 'none',
                }}
              >
                {t(`cat.${cat.value}`)}
              </button>
            ))}
          </div>
        )}

        {/* 項目 + 金額 */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
          <input
            className="input-field"
            value={form.item}
            onChange={(e) => setForm({ ...form, item: e.target.value })}
            placeholder={isExpense ? t('form.item.placeholder') : '項目名稱（例如阿嬤贊助）'}
            required
            autoFocus
          />
          <input
            type="number"
            className="input-field"
            value={form.amount}
            onChange={(e) => setForm({ ...form, amount: e.target.value })}
            placeholder={t('form.amount')}
            required
            min="0"
            step="1"
            style={{ fontWeight: 700, textAlign: 'right' }}
          />
        </div>
        {/* 即時匯率預覽（grid 外部，不影響格子大小） */}
        {form.currency !== preferredCur && form.amount && (
          <div style={{
            fontSize: '0.72rem', color: 'var(--text-muted)',
            textAlign: 'right', marginTop: '-0.5rem',
          }}>
            {previewLoading ? (
              <span>{t('form.converting')}</span>
            ) : previewRate ? (
              <span>
                ≈ {ALL_CURRENCIES[preferredCur]?.symbol || ''}
                {Math.round(parseFloat(form.amount) * previewRate).toLocaleString()}
                {' '}{ALL_CURRENCIES[preferredCur]?.nameCn || preferredCur}
              </span>
            ) : null}
          </div>
        )}

        {/* 幣種選擇 */}
        <div>
          <label style={{
            display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)',
            marginBottom: '0.25rem',
          }}>
            {t('form.currency')}
          </label>
          <div style={{ display: 'flex', gap: '0.375rem', flexWrap: 'wrap', alignItems: 'center' }}>
            {chipCurrencies.map(cur => (
              <button
                key={cur}
                type="button"
                onClick={() => setForm({ ...form, currency: cur })}
                style={{
                  padding: '0.375rem 0.75rem', borderRadius: '9999px',
                  border: form.currency === cur
                    ? '1px solid var(--color-primary)'
                    : '1px solid var(--border-color)',
                  fontSize: '0.78rem',
                  fontWeight: form.currency === cur ? 600 : 400,
                  cursor: 'pointer',
                  background: form.currency === cur ? 'rgba(14, 165, 233, 0.15)' : 'transparent',
                  color: form.currency === cur ? 'var(--color-primary)' : 'var(--text-secondary)',
                  transition: 'all 0.15s',
                }}
              >
                {getCurrencyChipLabel(cur, cleanCountries, locale)}
              </button>
            ))}
            <select
              className="input-field"
              value={chipCurrencies.includes(form.currency) ? '' : form.currency}
              onChange={(e) => { if (e.target.value) setForm({ ...form, currency: e.target.value }) }}
              style={{
                padding: '0.375rem 0.5rem', fontSize: '0.8rem',
                width: 'auto', minWidth: '100px', borderRadius: '9999px',
                color: !chipCurrencies.includes(form.currency) ? 'var(--color-primary)' : 'var(--text-muted)',
                fontWeight: !chipCurrencies.includes(form.currency) ? 600 : 400,
              }}
            >
              <option value="">{t('form.currency.other')}</option>
              {otherCurrencies.map(cur => (
                <option key={cur} value={cur}>{ALL_CURRENCIES[cur]?.label || cur}</option>
              ))}
            </select>
          </div>
        </div>

        {/* 備註（僅限支出） */}
        {isExpense && (
          <input
            className="input-field"
            value={form.note}
            onChange={(e) => setForm({ ...form, note: e.target.value })}
            placeholder={t('form.note')}
          />
        )}

        {/* 記帳時間 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
          <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
            <Calendar size={13} style={{ color: 'var(--color-primary)' }} />
            記帳時間
          </label>
          <input
            className="input-field"
            type="datetime-local"
            value={form.date}
            onChange={(e) => setForm({ ...form, date: e.target.value })}
            required
            style={{
              fontSize: '0.85rem',
              padding: '0.5rem 0.75rem',
            }}
          />
        </div>

        {/* 圖片備註（僅限支出） */}
        {isExpense && (
          <div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              onChange={handleImageSelect}
              style={{ display: 'none' }}
            />
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {images.map((src, idx) => (
                <div key={idx} style={{
                  position: 'relative',
                  borderRadius: '10px', overflow: 'hidden',
                  border: '1px solid var(--border-color)',
                  cursor: 'pointer',
                }}>
                  <img
                    src={src} alt=""
                    onClick={() => setLightboxIndex(idx)}
                    style={{
                      width: '100%', maxHeight: '200px',
                      objectFit: 'cover', display: 'block',
                    }}
                  />
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); removeImage(idx) }}
                    style={{
                      position: 'absolute', top: 6, right: 6,
                      width: 24, height: 24, borderRadius: '50%',
                      background: 'rgba(0,0,0,0.55)', color: '#fff',
                      border: 'none', cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '12px', lineHeight: 1,
                      backdropFilter: 'blur(4px)',
                    }}
                  >✕</button>
                </div>
              ))}
              {compressing ? (
                <div style={{
                  width: '100%', padding: '0.625rem',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  gap: '0.5rem', fontSize: '0.75rem',
                  color: 'var(--color-primary)',
                  background: 'var(--bg-card-hover)',
                  borderRadius: '8px',
                }}>
                  <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
                  圖片處理中...
                </div>
              ) : images.length < 3 && (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="btn-nav"
                  style={{
                    width: '100%', padding: '0.625rem',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    gap: '0.375rem', fontSize: '0.75rem',
                    color: 'var(--text-muted)',
                  }}
                >
                  <ImagePlus size={16} />
                  {images.length === 0 ? '加圖片備註（最多 3 張）' : `繼續加圖片（${images.length}/3）`}
                </button>
              )}
            </div>
          </div>
        )}

        {/* Lightbox 全螢幕查看 */}
          {lightboxIndex !== null && images[lightboxIndex] && (
            <div
              onClick={() => setLightboxIndex(null)}
              onTouchStart={(e) => { touchStartX.current = e.targetTouches[0].clientX }}
              onTouchMove={(e) => { touchEndX.current = e.targetTouches[0].clientX }}
              onTouchEnd={() => {
                if (!touchStartX.current || !touchEndX.current) return
                const diff = touchStartX.current - touchEndX.current
                if (diff > 50) {
                  // 向左滑 -> 下一張
                  setLightboxIndex(prev => prev !== null ? (prev + 1) % images.length : 0)
                } else if (diff < -50) {
                  // 向右滑 -> 上一張
                  setLightboxIndex(prev => prev !== null ? (prev - 1 + images.length) % images.length : 0)
                }
                touchStartX.current = null
                touchEndX.current = null
              }}
              style={{
                position: 'fixed', inset: 0,
                background: 'rgba(0,0,0,0.95)',
                zIndex: 30000,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'zoom-out',
                padding: '1rem',
              }}
            >
              {/* 注入 CSS 隱藏手機版底部導覽列 */}
              <style>{`
                .mobile-bottom-nav {
                  display: none !important;
                }
              `}</style>

              {/* 關閉按鈕 */}
              <button
                type="button"
                onClick={() => setLightboxIndex(null)}
                style={{
                  position: 'absolute', top: 'calc(28px + env(safe-area-inset-top))', right: '20px',
                  width: '40px', height: '40px', borderRadius: '50%',
                  background: 'rgba(255,255,255,0.2)', color: '#fff',
                  border: 'none', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  zIndex: 31000,
                  backdropFilter: 'blur(8px)',
                  transition: 'background 0.2s',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.3)' }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.2)' }}
              >
                <X size={20} />
              </button>

              {/* 圖片 Slider 容器 */}
              <div
                onClick={(e) => e.stopPropagation()} // 阻止點擊圖片本身時關閉 lightbox
                style={{
                  position: 'relative',
                  width: '100%',
                  maxWidth: '900px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {/* 左箭頭 */}
                {images.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setLightboxIndex(prev => prev !== null ? (prev - 1 + images.length) % images.length : 0)}
                    style={{
                      position: 'absolute', left: '16px',
                      width: '44px', height: '44px', borderRadius: '50%',
                      background: 'rgba(0,0,0,0.5)', color: '#fff',
                      border: '1px solid rgba(255,255,255,0.2)', cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      zIndex: 10005,
                      backdropFilter: 'blur(4px)',
                      transition: 'all 0.2s',
                    }}
                  >
                    <ArrowLeft size={20} />
                  </button>
                )}

                <img
                  src={images[lightboxIndex]} alt=""
                  onClick={(e) => {
                    e.stopPropagation()
                    setLightboxIndex(prev => prev !== null ? (prev + 1) % images.length : 0)
                  }}
                  style={{
                    maxWidth: '100%', maxHeight: '85vh',
                    objectFit: 'contain', borderRadius: '8px',
                    boxShadow: '0 10px 40px rgba(0,0,0,0.5)',
                    cursor: images.length > 1 ? 'pointer' : 'default',
                  }}
                />

                {/* 右箭頭 */}
                {images.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setLightboxIndex(prev => prev !== null ? (prev + 1) % images.length : 0)}
                    style={{
                      position: 'absolute', right: '16px',
                      width: '44px', height: '44px', borderRadius: '50%',
                      background: 'rgba(0,0,0,0.5)', color: '#fff',
                      border: '1px solid rgba(255,255,255,0.2)', cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      zIndex: 10005,
                      backdropFilter: 'blur(4px)',
                      transition: 'all 0.2s',
                    }}
                  >
                    <div style={{ transform: 'rotate(180deg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <ArrowLeft size={20} />
                    </div>
                  </button>
                )}

                {/* 圖片頁數指示標籤 */}
                {images.length > 1 && (
                  <div style={{
                    position: 'absolute', bottom: '-40px',
                    background: 'rgba(0,0,0,0.6)', color: '#fff',
                    padding: '4px 12px', borderRadius: '12px',
                    fontSize: '0.8rem', fontWeight: 500,
                  }}>
                    {lightboxIndex + 1} / {images.length}
                  </div>
                )}
              </div>
            </div>
          )}

        {submitError && (
          <div
            role="alert"
            style={{
              padding: '0.625rem 0.75rem',
              borderRadius: '8px',
              background: 'rgba(239, 68, 68, 0.1)',
              color: 'var(--color-danger)',
              fontSize: '0.78rem',
            }}
          >
            {submitError}
          </div>
        )}

        <button
          type="submit"
          className="btn-primary"
          disabled={loading || compressing}
          style={{
            justifyContent: 'center', padding: '0.625rem',
            opacity: (loading || compressing) ? 0.7 : 1,
            background: isExpense ? undefined : 'linear-gradient(135deg, var(--color-success), #16a34a)',
          }}
        >
          {loading ? (
            <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
          ) : compressing ? (
            <><Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> 圖片處理中...</>
          ) : isExpense ? (
            <><PlusCircle size={16} /> {t('form.submit.expense')}</>
          ) : (
            <><Wallet size={16} /> {t('form.submit.income')}</>
          )}
        </button>

        {/* 匯率更新時間 */}
        {rateUpdatedAt && form.currency !== preferredCur && (
          <div style={{
            textAlign: 'center', fontSize: '0.65rem', color: 'var(--text-muted)',
            marginTop: '0.25rem',
          }}>
            {t('form.rateUpdate', { time: rateUpdatedAt })}
          </div>
        )}
      </form>
    </div>
  )
}

// === 花費詳情 / 編輯 Modal ===
function EditExpenseModal({ expense, tripId, defaultCurrency, countries, onClose, onSave }: {
  expense: TripData['expenses'][0]
  tripId: string
  defaultCurrency: string
  countries: string[]
  onClose: () => void
  onSave: () => void
}) {
  const [mode, setMode] = useState<'view' | 'edit'>('view')
  const [form, setForm] = useState({
    category: expense.category,
    item: expense.item,
    amount: String(expense.amount),
    currency: expense.currency,
    note: expense.note || '',
    date: format(new Date(expense.date), "yyyy-MM-dd'T'HH:mm"),
  })
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [compressing, setCompressing] = useState(false)
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)
  const touchStartX = useRef<number | null>(null)
  const touchEndX = useRef<number | null>(null)
  const images = expense.images || []
  const [editImages, setEditImages] = useState<string[]>(expense.images || [])
  const editFileRef = useRef<HTMLInputElement>(null)
  const { locale, t } = useLanguage()

  const cat = getCategoryInfo(expense.category)

  // 壓縮圖片
  const compressImg = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = (ev) => {
        const img = new window.Image()
        img.onload = () => {
          const canvas = document.createElement('canvas')
          const maxW = 800
          let w = img.width, h = img.height
          if (w > maxW) { h = (h * maxW) / w; w = maxW }
          canvas.width = w; canvas.height = h
          const ctx = canvas.getContext('2d')!
          ctx.drawImage(img, 0, 0, w, h)
          resolve(canvas.toDataURL('image/jpeg', 0.6))
        }
        img.onerror = reject
        img.src = ev.target?.result as string
      }
      reader.onerror = reject
      reader.readAsDataURL(file)
    })
  }

  const handleEditImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    if (files.length === 0) return
    setCompressing(true)
    const remaining = 3 - editImages.length
    const toProcess = files.slice(0, remaining)
    try {
      const compressed = await Promise.all(toProcess.map(compressImg))
      setEditImages(prev => [...prev, ...compressed].slice(0, 3))
    } catch (err) {
      console.error("Edit image compression error:", err)
      alert("圖片處理失敗，請重試")
    } finally {
      setCompressing(false)
      if (editFileRef.current) editFileRef.current.value = ''
    }
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const res = await fetch(`/api/trips/${tripId}/expenses/${expense.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category: form.category,
          item: form.item,
          amount: parseFloat(form.amount),
          currency: form.currency,
          note: form.note || null,
          images: editImages,
          date: new Date(form.date).toISOString(),
        }),
      })
      if (res.ok) onSave()
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!confirm('確定要刪除這筆花費嗎？')) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/trips/${tripId}/expenses/${expense.id}`, {
        method: 'DELETE',
      })
      if (res.ok) onSave()
    } finally {
      setDeleting(false)
    }
  }

  // 幣種 chips（僅編輯模式用）
  const cleanCountries = extractCleanCountries(countries)
  const tripCurrencies = getCurrenciesFromCountries(cleanCountries)
  const chipCurrencies = [...tripCurrencies]
  if (!chipCurrencies.includes('TWD')) chipCurrencies.push('TWD')
  if (!chipCurrencies.includes(defaultCurrency)) chipCurrencies.push(defaultCurrency)

  const isBusy = saving || deleting

  return (
    <>
    <div
      onClick={() => { if (!isBusy) onClose() }}
      style={{
        position: 'fixed', inset: 0, zIndex: 20000,
        background: 'rgba(0, 0, 0, 0.5)',
        backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 'calc(3.5rem + env(safe-area-inset-top)) 1.5rem 1.5rem 1.5rem',
        animation: 'fadeIn 0.15s ease-out',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="glass-card trip-modal"
        style={{
          width: '100%', maxWidth: '420px', padding: '1.75rem',
          animation: 'fadeInDown 0.2s ease-out',
          maxHeight: '80vh', display: 'flex', flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {mode === 'view' ? (
          /* ===== 詳情模式 ===== */
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
            {/* Header (固定) */}
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              marginBottom: '1.25rem', flexShrink: 0
            }}>
              <span style={{
                padding: '0.3rem 0.75rem', borderRadius: '9999px',
                fontSize: '0.8rem', fontWeight: 600,
                background: `${cat.color}20`, color: cat.color,
              }}>
                {t(`cat.${expense.category}`)}
              </span>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  onClick={() => setMode('edit')}
                  className="btn-nav"
                  style={{
                    padding: '0.4rem', display: 'flex',
                    alignItems: 'center', justifyContent: 'center',
                  }}
                  title="編輯"
                >
                  <Pencil size={16} />
                </button>
                <button
                  onClick={() => { if (!isBusy) onClose() }}
                  className="btn-nav"
                  style={{
                    padding: '0.4rem', display: 'flex',
                    alignItems: 'center', justifyContent: 'center',
                  }}
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            {/* 內容 (可滾動) */}
            <div style={{ overflowY: 'auto', flex: 1, paddingRight: '0.25rem' }}>
              {/* 項目名稱 */}
              <h2 style={{
                fontSize: '1.25rem', fontWeight: 700,
                marginBottom: '0.5rem', letterSpacing: '-0.01em',
              }}>
                {expense.item}
              </h2>

              {/* 金額 */}
              <div
                className="expense-amount"
                style={{
                  fontSize: '1.5rem', fontWeight: 800,
                  color: 'var(--color-primary)',
                  marginBottom: '0.25rem',
                }}
              >
                {getCurrencySymbol(expense.currency)}{expense.amount.toLocaleString()}
              </div>
              {expense.convertedAmount && expense.currency !== defaultCurrency && (
                <div style={{
                  fontSize: '0.8rem', color: 'var(--text-muted)',
                  marginBottom: '1rem',
                }}>
                  ≈ {getCurrencySymbol(defaultCurrency)}{expense.convertedAmount.toLocaleString()}
                </div>
              )}

              {/* 資訊列 */}
              <div style={{
                display: 'flex', flexDirection: 'column', gap: '0.625rem',
                padding: '0.875rem', borderRadius: 'var(--radius)',
                background: 'var(--bg-card-hover)', marginBottom: '1rem',
                fontSize: '0.8rem',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-muted)' }}>{t('expense.detail.recordedBy')}</span>
                  <span style={{ fontWeight: 500 }}>{expense.user.name}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-muted)' }}>{t('expense.detail.time')}</span>
                  <span style={{ fontWeight: 500 }}>
                    {format(new Date(expense.date), 'yyyy/M/d HH:mm')}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-muted)' }}>{t('expense.detail.currency')}</span>
                  <span style={{ fontWeight: 500 }}>
                    {getCurrencyChipLabel(expense.currency, cleanCountries, locale)}
                  </span>
                </div>
                {expense.note && (
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-muted)', flexShrink: 0 }}>{t('expense.detail.note')}</span>
                    <span style={{ fontWeight: 500, textAlign: 'right', maxWidth: '65%', wordBreak: 'break-word' }}>
                      {expense.note}
                    </span>
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-muted)' }}>{t('expense.detail.source')}</span>
                  <span style={{ fontWeight: 500 }}>
                    {expense.source === 'line' ? t('expense.detail.source.line') : t('expense.detail.source.web')}
                  </span>
                </div>
              </div>

              {/* 圖片（完整顯示） */}
              {expense.images && expense.images.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {expense.images.map((src, idx) => (
                    <div key={idx} style={{
                      borderRadius: '10px', overflow: 'hidden',
                      border: '1px solid var(--border-color)',
                      cursor: 'pointer',
                    }}>
                      <img
                        src={src} alt={`附圖 ${idx + 1}`}
                        onClick={() => setLightboxIndex(idx)}
                        style={{
                          width: '100%', display: 'block',
                          maxHeight: '300px', objectFit: 'cover',
                        }}
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : (
          /* ===== 編輯模式 ===== */
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
            {/* Header (固定) */}
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              marginBottom: '1.25rem', flexShrink: 0
            }}>
              <h3 style={{
                fontSize: '1rem', fontWeight: 700,
                display: 'flex', alignItems: 'center', gap: '0.5rem',
              }}>
                <Pencil size={16} style={{ color: 'var(--color-primary)' }} />
                編輯花費
              </h3>
              <button
                onClick={() => { if (!isBusy) setMode('view') }}
                disabled={isBusy}
                className="btn-nav"
                style={{
                  padding: '0.4rem', display: 'flex',
                  alignItems: 'center', justifyContent: 'center',
                }}
              >
                <X size={16} />
              </button>
            </div>

            {/* 內容 (可滾動) */}
            <div style={{ overflowY: 'auto', flex: 1, paddingRight: '0.25rem' }}>
              {/* 分類 */}
              <div style={{ display: 'flex', gap: '0.375rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
                {EXPENSE_CATEGORIES.map(c => (
                  <button
                    key={c.value}
                    type="button"
                    onClick={() => setForm({ ...form, category: c.value })}
                    style={{
                      padding: '0.3rem 0.625rem', borderRadius: '9999px',
                      fontSize: '0.75rem', cursor: 'pointer',
                      border: form.category === c.value ? `1.5px solid ${c.color}` : '1.5px solid transparent',
                      fontWeight: form.category === c.value ? 600 : 500,
                      background: form.category === c.value ? `${c.color}25` : 'var(--bg-card-hover)',
                      color: form.category === c.value ? c.color : 'var(--text-secondary)',
                      transition: 'all 0.2s',
                    }}
                  >
                    {t(`cat.${c.value}`)}
                  </button>
                ))}
              </div>

              {/* 品名 + 金額 */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '0.75rem' }}>
                <input
                  className="input-field"
                  value={form.item}
                  onChange={(e) => setForm({ ...form, item: e.target.value })}
                  placeholder="項目名稱"
                />
                <input
                  type="number"
                  className="input-field"
                  value={form.amount}
                  onChange={(e) => setForm({ ...form, amount: e.target.value })}
                  placeholder="金額"
                  style={{ fontWeight: 700, textAlign: 'right' }}
                />
              </div>

              {/* 幣種 */}
              <div style={{ display: 'flex', gap: '0.375rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
                {chipCurrencies.map(cur => (
                  <button
                    key={cur}
                    type="button"
                    onClick={() => setForm({ ...form, currency: cur })}
                    style={{
                      padding: '0.3rem 0.625rem', borderRadius: '9999px',
                      border: form.currency === cur
                        ? '1px solid var(--color-primary)'
                        : '1px solid var(--border-color)',
                      fontSize: '0.75rem',
                      fontWeight: form.currency === cur ? 600 : 400,
                      cursor: 'pointer',
                      background: form.currency === cur ? 'rgba(14, 165, 233, 0.15)' : 'transparent',
                      color: form.currency === cur ? 'var(--color-primary)' : 'var(--text-secondary)',
                      transition: 'all 0.15s',
                    }}
                  >
                    {getCurrencyChipLabel(cur, cleanCountries, locale)}
                  </button>
                ))}
              </div>

              {/* 備註 */}
              <input
                className="input-field"
                value={form.note}
                onChange={(e) => setForm({ ...form, note: e.target.value })}
                placeholder="備註（選填）"
                style={{ marginBottom: '0.75rem' }}
              />

              {/* 消費時間 */}
              <div style={{ marginBottom: '0.75rem' }}>
                <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>
                  消費日期與時間
                </label>
                <input
                  type="datetime-local"
                  className="input-field"
                  value={form.date}
                  onChange={(e) => setForm({ ...form, date: e.target.value })}
                  style={{ fontSize: '0.85rem' }}
                />
              </div>

              {/* 圖片編輯 */}
              <div style={{ marginBottom: '1rem' }}>
                <label style={{
                  display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)',
                  marginBottom: '0.375rem',
                }}>
                  附圖（最多 3 張）
                </label>
                {editImages.length > 0 && (
                  <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.5rem' }}>
                    {editImages.map((src, idx) => (
                      <div key={idx} style={{ position: 'relative' }}>
                        <img src={src} alt="" style={{
                          width: 72, height: 72, objectFit: 'cover',
                          borderRadius: '8px', border: '1px solid var(--border-color)',
                        }} />
                        <button
                          type="button"
                          onClick={() => setEditImages(prev => prev.filter((_, i) => i !== idx))}
                          style={{
                            position: 'absolute', top: -6, right: -6,
                            width: 20, height: 20, borderRadius: '50%',
                            background: '#ef4444', color: '#fff',
                            border: '2px solid white', cursor: 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: '10px', fontWeight: 700, lineHeight: 1,
                          }}
                        >✕</button>
                      </div>
                    ))}
                  </div>
                )}
                {compressing ? (
                  <div style={{
                    padding: '0.4rem 0.75rem', fontSize: '0.75rem',
                    display: 'flex', alignItems: 'center', gap: '0.375rem',
                    color: 'var(--color-primary)',
                  }}>
                    <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />
                    圖片處理中...
                  </div>
                ) : editImages.length < 3 && (
                  <>
                    <input
                      ref={editFileRef}
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={handleEditImageSelect}
                      style={{ display: 'none' }}
                    />
                    <button
                      type="button"
                      onClick={() => editFileRef.current?.click()}
                      className="btn-nav"
                      style={{
                        padding: '0.4rem 0.75rem', fontSize: '0.75rem',
                        display: 'flex', alignItems: 'center', gap: '0.375rem',
                      }}
                    >
                      <ImagePlus size={14} /> 新增圖片
                    </button>
                  </>
                )}
              </div>

              {/* 操作按鈕 */}
              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  className="btn-nav"
                  style={{
                    padding: '0.625rem', color: '#ef4444',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    gap: '0.375rem', fontSize: '0.8rem',
                  }}
                >
                  <Trash2 size={14} />
                  {deleting ? '刪除中...' : '刪除'}
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving || deleting || compressing || !form.item || !form.amount}
                  className="btn-primary"
                  style={{
                    flex: 1, justifyContent: 'center', padding: '0.625rem',
                    opacity: (saving || compressing) ? 0.7 : 1,
                  }}
                >
                  {saving ? (
                    <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
                  ) : compressing ? (
                    <><Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> 圖片處理中...</>
                  ) : (
                    <>
                      <Check size={16} /> 儲存修改
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>

    {/* Lightbox 全螢幕查看 */}
    {lightboxIndex !== null && images[lightboxIndex] && (
      <div
        onClick={() => setLightboxIndex(null)}
        onTouchStart={(e) => { touchStartX.current = e.targetTouches[0].clientX }}
        onTouchMove={(e) => { touchEndX.current = e.targetTouches[0].clientX }}
        onTouchEnd={() => {
          if (!touchStartX.current || !touchEndX.current) return
          const diff = touchStartX.current - touchEndX.current
          if (diff > 50) {
            // 向左滑 -> 下一張
            setLightboxIndex(prev => prev !== null ? (prev + 1) % images.length : 0)
          } else if (diff < -50) {
            // 向右滑 -> 上一張
            setLightboxIndex(prev => prev !== null ? (prev - 1 + images.length) % images.length : 0)
          }
          touchStartX.current = null
          touchEndX.current = null
        }}
        style={{
          position: 'fixed', inset: 0,
          background: 'rgba(0,0,0,0.95)',
          zIndex: 30000,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'zoom-out',
          padding: '1rem',
        }}
      >
        {/* 注入 CSS 隱藏手機版底部導覽列 */}
        <style>{`
          .mobile-bottom-nav {
            display: none !important;
          }
        `}</style>

        {/* 關閉按鈕 */}
        <button
          type="button"
          onClick={() => setLightboxIndex(null)}
          style={{
            position: 'absolute', top: 'calc(28px + env(safe-area-inset-top))', right: '20px',
            width: '40px', height: '40px', borderRadius: '50%',
            background: 'rgba(255,255,255,0.2)', color: '#fff',
            border: 'none', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 31000,
            backdropFilter: 'blur(8px)',
            transition: 'background 0.2s',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.3)' }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.2)' }}
        >
          <X size={20} />
        </button>

        {/* 圖片 Slider 容器 */}
        <div
          onClick={(e) => e.stopPropagation()} // 阻止點擊圖片本身時關閉 lightbox
          style={{
            position: 'relative',
            width: '100%',
            maxWidth: '900px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {/* 左箭頭 */}
          {images.length > 1 && (
            <button
              type="button"
              onClick={() => setLightboxIndex(prev => prev !== null ? (prev - 1 + images.length) % images.length : 0)}
              style={{
                position: 'absolute', left: '16px',
                width: '44px', height: '44px', borderRadius: '50%',
                background: 'rgba(0,0,0,0.5)', color: '#fff',
                border: '1px solid rgba(255,255,255,0.2)', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                zIndex: 10005,
                backdropFilter: 'blur(4px)',
                transition: 'all 0.2s',
              }}
            >
              <ArrowLeft size={20} />
            </button>
          )}

          <img
            src={images[lightboxIndex]} alt=""
            onClick={(e) => {
              e.stopPropagation()
              setLightboxIndex(prev => prev !== null ? (prev + 1) % images.length : 0)
            }}
            style={{
              maxWidth: '100%', maxHeight: '85vh',
              objectFit: 'contain', borderRadius: '8px',
              boxShadow: '0 10px 40px rgba(0,0,0,0.5)',
              cursor: images.length > 1 ? 'pointer' : 'default',
            }}
          />

          {/* 右箭頭 */}
          {images.length > 1 && (
            <button
              type="button"
              onClick={() => setLightboxIndex(prev => prev !== null ? (prev + 1) % images.length : 0)}
              style={{
                position: 'absolute', right: '16px',
                width: '44px', height: '44px', borderRadius: '50%',
                background: 'rgba(0,0,0,0.5)', color: '#fff',
                border: '1px solid rgba(255,255,255,0.2)', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                zIndex: 10005,
                backdropFilter: 'blur(4px)',
                transition: 'all 0.2s',
              }}
            >
              <div style={{ transform: 'rotate(180deg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <ArrowLeft size={20} />
              </div>
            </button>
          )}

          {/* 圖片頁數指示標籤 */}
          {images.length > 1 && (
            <div style={{
              position: 'absolute', bottom: '-40px',
              background: 'rgba(0,0,0,0.6)', color: '#fff',
              padding: '4px 12px', borderRadius: '12px',
              fontSize: '0.8rem', fontWeight: 500,
            }}>
              {lightboxIndex + 1} / {images.length}
            </div>
          )}
        </div>
      </div>
    )}

    {/* Lightbox 全螢幕查看圖片 (編輯模式用) */}
    {lightboxIndex !== null && editImages[lightboxIndex] && (
      <div
        onClick={() => setLightboxIndex(null)}
        onTouchStart={(e) => { touchStartX.current = e.targetTouches[0].clientX }}
        onTouchMove={(e) => { touchEndX.current = e.targetTouches[0].clientX }}
        onTouchEnd={() => {
          if (!touchStartX.current || !touchEndX.current) return
          const diff = touchStartX.current - touchEndX.current
          if (diff > 50) {
            // 向左滑 -> 下一張
            setLightboxIndex(prev => prev !== null ? (prev + 1) % editImages.length : 0)
          } else if (diff < -50) {
            // 向右滑 -> 上一張
            setLightboxIndex(prev => prev !== null ? (prev - 1 + editImages.length) % editImages.length : 0)
          }
          touchStartX.current = null
          touchEndX.current = null
        }}
        style={{
          position: 'fixed', inset: 0,
          background: 'rgba(0,0,0,0.95)',
          zIndex: 30000,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'zoom-out',
          padding: '1rem',
        }}
      >
        {/* 注入 CSS 隱藏手機版底部導覽列 */}
        <style>{`
          .mobile-bottom-nav {
            display: none !important;
          }
        `}</style>

        {/* 關閉按鈕 */}
        <button
          type="button"
          onClick={() => setLightboxIndex(null)}
          style={{
            position: 'absolute', top: 'calc(28px + env(safe-area-inset-top))', right: '20px',
            width: '40px', height: '40px', borderRadius: '50%',
            background: 'rgba(255,255,255,0.2)', color: '#fff',
            border: 'none', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 31000,
            backdropFilter: 'blur(8px)',
            transition: 'background 0.2s',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.3)' }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.2)' }}
        >
          <X size={20} />
        </button>

        {/* 圖片 Slider 容器 */}
        <div
          onClick={(e) => e.stopPropagation()} // 阻止點擊圖片本身時關閉 lightbox
          style={{
            position: 'relative',
            width: '100%',
            maxWidth: '900px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {/* 左箭頭 */}
          {editImages.length > 1 && (
            <button
              type="button"
              onClick={() => setLightboxIndex(prev => prev !== null ? (prev - 1 + editImages.length) % editImages.length : 0)}
              style={{
                position: 'absolute', left: '16px',
                width: '44px', height: '44px', borderRadius: '50%',
                background: 'rgba(0,0,0,0.5)', color: '#fff',
                border: '1px solid rgba(255,255,255,0.2)', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                zIndex: 10005,
                backdropFilter: 'blur(4px)',
                transition: 'all 0.2s',
              }}
            >
              <ArrowLeft size={20} />
            </button>
          )}

          <img
            src={editImages[lightboxIndex]} alt=""
            onClick={(e) => {
              e.stopPropagation()
              setLightboxIndex(prev => prev !== null ? (prev + 1) % editImages.length : 0)
            }}
            style={{
              maxWidth: '100%', maxHeight: '85vh',
              objectFit: 'contain', borderRadius: '8px',
              boxShadow: '0 10px 40px rgba(0,0,0,0.5)',
              cursor: editImages.length > 1 ? 'pointer' : 'default',
            }}
          />

          {/* 右箭頭 */}
          {editImages.length > 1 && (
            <button
              type="button"
              onClick={() => setLightboxIndex(prev => prev !== null ? (prev + 1) % editImages.length : 0)}
              style={{
                position: 'absolute', right: '16px',
                width: '44px', height: '44px', borderRadius: '50%',
                background: 'rgba(0,0,0,0.5)', color: '#fff',
                border: '1px solid rgba(255,255,255,0.2)', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                zIndex: 10005,
                backdropFilter: 'blur(4px)',
                transition: 'all 0.2s',
              }}
            >
              <div style={{ transform: 'rotate(180deg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <ArrowLeft size={20} />
              </div>
            </button>
          )}

          {/* 圖片頁數指示標籤 */}
          {editImages.length > 1 && (
            <div style={{
              position: 'absolute', bottom: '-40px',
              background: 'rgba(0,0,0,0.6)', color: '#fff',
              padding: '4px 12px', borderRadius: '12px',
              fontSize: '0.8rem', fontWeight: 500,
            }}>
              {lightboxIndex + 1} / {editImages.length}
            </div>
          )}
        </div>
      </div>
    )}
    </>
  )
}

// === 編輯收入 Modal ===
function EditDepositModal({ deposit, tripId, defaultCurrency, countries, onClose, onSave }: {
  deposit: DepositDisplayTransaction
  tripId: string
  defaultCurrency: string
  countries: string[]
  onClose: () => void
  onSave: () => void
}) {
  const [mode, setMode] = useState<'view' | 'edit'>('view')
  const [form, setForm] = useState({
    item: deposit.item || '',
    amount: String(deposit.amount),
    currency: deposit.currency,
    date: format(new Date(deposit.date), "yyyy-MM-dd'T'HH:mm"),
  })
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const { locale, t } = useLanguage()

  const handleSave = async () => {
    setSaving(true)
    try {
      const res = await fetch(`/api/trips/${tripId}/deposits/${deposit.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: parseFloat(form.amount),
          currency: form.currency,
          note: form.item,
          date: new Date(form.date).toISOString(),
        }),
      })
      if (res.ok) onSave()
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!confirm('確定要刪除這筆收入嗎？')) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/trips/${tripId}/deposits/${deposit.id}`, {
        method: 'DELETE',
      })
      if (res.ok) onSave()
    } finally {
      setDeleting(false)
    }
  }

  const cleanCountries = extractCleanCountries(countries)
  const tripCurrencies = getCurrenciesFromCountries(cleanCountries)
  const chipCurrencies = [...tripCurrencies]
  if (!chipCurrencies.includes('TWD')) chipCurrencies.push('TWD')
  if (!chipCurrencies.includes(defaultCurrency)) chipCurrencies.push(defaultCurrency)
  const otherCurrencies = Object.keys(ALL_CURRENCIES).filter(c => !chipCurrencies.includes(c))

  const isBusy = saving || deleting

  return (
    <div
      onClick={() => { if (!isBusy) onClose() }}
      style={{
        position: 'fixed', inset: 0, zIndex: 20000,
        background: 'rgba(0, 0, 0, 0.5)',
        backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 'calc(3.5rem + env(safe-area-inset-top)) 1.5rem 1.5rem 1.5rem',
        animation: 'fadeIn 0.15s ease-out',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="glass-card trip-modal"
        style={{
          width: '100%', maxWidth: '420px', padding: '1.75rem',
          animation: 'fadeInDown 0.2s ease-out',
          maxHeight: '80vh', display: 'flex', flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {mode === 'view' ? (
          /* ===== 詳情模式 ===== */
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
            {/* Header */}
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              marginBottom: '1.25rem', flexShrink: 0
            }}>
              <span style={{
                padding: '0.3rem 0.75rem', borderRadius: '9999px',
                fontSize: '0.8rem', fontWeight: 600,
                background: 'rgba(34, 197, 94, 0.12)', color: '#22c55e',
              }}>
                {t('form.tab.income')}
              </span>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  onClick={() => setMode('edit')}
                  className="btn-nav"
                  style={{
                    padding: '0.4rem', display: 'flex',
                    alignItems: 'center', justifyContent: 'center',
                  }}
                  title="編輯"
                >
                  <Pencil size={16} />
                </button>
                <button
                  onClick={() => { if (!isBusy) onClose() }}
                  className="btn-nav"
                  style={{
                    padding: '0.4rem', display: 'flex',
                    alignItems: 'center', justifyContent: 'center',
                  }}
                  title="關閉"
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            {/* 內容區域 */}
            <div style={{ flex: 1, overflowY: 'auto', paddingRight: '0.25rem' }}>
              <div style={{ marginBottom: '1.5rem' }}>
                <h2 style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '0.25rem' }}>
                  {deposit.item}
                </h2>
                <div
                  className="deposit-amount"
                  style={{ fontSize: '1.75rem', fontWeight: 800, color: '#22c55e' }}
                >
                  +{getCurrencySymbol(deposit.currency)}{deposit.amount.toLocaleString()}
                </div>
              </div>

              {/* 詳情項目列表 */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem', background: 'var(--bg-card-hover)', padding: '1rem', borderRadius: '12px' }}>
                <div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.15rem' }}>記帳時間</div>
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-primary)', fontWeight: 500 }}>
                    {format(new Date(deposit.date), 'yyyy/M/d HH:mm')}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.15rem' }}>記帳人</div>
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-primary)', fontWeight: 500 }}>{deposit.user?.name}</div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* ===== 編輯模式 ===== */
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexShrink: 0 }}>
              <h3 style={{ fontSize: '1rem', fontWeight: 700 }}>編輯收入項目</h3>
              <button
                onClick={() => setMode('view')}
                className="btn-nav"
                style={{ padding: '0.4rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                <X size={16} />
              </button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', paddingRight: '0.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {/* 品項名稱 */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
                <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>項目名稱</label>
                <input
                  className="input-field"
                  value={form.item}
                  onChange={(e) => setForm({ ...form, item: e.target.value })}
                  placeholder="例如：阿嬤贊助、公積金儲值"
                  required
                />
              </div>

              {/* 金額 */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
                <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>金額</label>
                <input
                  className="input-field"
                  type="number"
                  inputMode="decimal"
                  value={form.amount}
                  onChange={(e) => setForm({ ...form, amount: e.target.value })}
                  placeholder="輸入金額"
                  required
                />
              </div>

              {/* 幣種 */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
                <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>幣種</label>
                <div style={{ display: 'flex', gap: '0.375rem', flexWrap: 'wrap' }}>
                  {chipCurrencies.map(cur => (
                    <button
                      key={cur}
                      type="button"
                      onClick={() => setForm({ ...form, currency: cur })}
                      style={{
                        padding: '0.375rem 0.75rem', borderRadius: '9999px', fontSize: '0.8rem',
                        border: form.currency === cur ? '1px solid var(--color-primary)' : '1px solid var(--border-color)',
                        fontWeight: form.currency === cur ? 600 : 400,
                        cursor: 'pointer',
                        background: form.currency === cur ? 'rgba(14, 165, 233, 0.15)' : 'transparent',
                        color: form.currency === cur ? 'var(--color-primary)' : 'var(--text-secondary)',
                      }}
                    >
                      {getCurrencyChipLabel(cur, cleanCountries, locale)}
                    </button>
                  ))}
                  <select
                    className="input-field"
                    value={chipCurrencies.includes(form.currency) ? '' : form.currency}
                    onChange={(e) => { if (e.target.value) setForm({ ...form, currency: e.target.value }) }}
                    style={{
                      padding: '0.375rem 0.5rem', fontSize: '0.8rem',
                      width: 'auto', minWidth: '100px', borderRadius: '9999px',
                      color: !chipCurrencies.includes(form.currency) ? 'var(--color-primary)' : 'var(--text-muted)',
                      fontWeight: !chipCurrencies.includes(form.currency) ? 600 : 400,
                    }}
                  >
                    <option value="">其他幣種...</option>
                    {otherCurrencies.map(cur => (
                      <option key={cur} value={cur}>{ALL_CURRENCIES[cur]?.label || cur}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* 記帳時間 */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
                <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>記帳時間</label>
                <input
                  className="input-field"
                  type="datetime-local"
                  value={form.date}
                  onChange={(e) => setForm({ ...form, date: e.target.value })}
                  required
                />
              </div>
            </div>

            {/* 操作按鈕 */}
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1.5rem', flexShrink: 0 }}>
              <button
                type="button"
                onClick={handleDelete}
                disabled={isBusy}
                className="btn-danger"
                style={{ padding: '0.625rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                title="刪除"
              >
                {deleting ? (
                  <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
                ) : (
                  <Trash2 size={16} />
                )}
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={isBusy || !form.item || !form.amount}
                className="btn-primary"
                style={{ flex: 1, justifyContent: 'center', padding: '0.625rem' }}
              >
                {saving ? (
                  <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
                ) : (
                  '儲存修改'
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
