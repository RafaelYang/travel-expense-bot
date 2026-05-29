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

import { useEffect, useState, use } from "react"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import { Navbar } from "@/components/navbar"
import { BudgetProgress } from "@/components/budget-progress"
import {
  ArrowLeft, PlusCircle, Wallet, Users, Calendar, Settings,
  ChevronDown, ChevronUp, Loader2, Trash2, X, Copy, Check,
} from "lucide-react"
import Link from "next/link"
import { format, isToday, differenceInDays } from "date-fns"
import { zhTW, enUS } from "date-fns/locale"
import { useLanguage } from "@/components/language-provider"
import {
  EXPENSE_CATEGORIES, getCategoryInfo, getCurrencySymbol,
  CURRENCIES, formatCurrency,
} from "@/lib/utils"
import { getCurrenciesFromCountries, ALL_CURRENCIES, getCurrencyChipLabel } from "@/lib/countries"

interface TripData {
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
  totalSpent: number
  totalDeposits: number
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

export default function TripPage({ params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = use(params)
  const { data: session } = useSession()
  const router = useRouter()
  const [trip, setTrip] = useState<TripData | null>(null)
  const [loading, setLoading] = useState(true)
  const [showExpenseForm, setShowExpenseForm] = useState(false)
  const [showAllExpenses, setShowAllExpenses] = useState(false)
  const [showMemberList, setShowMemberList] = useState(false)
  const { t, locale } = useLanguage()
  const dateLocale = locale === 'en' ? enUS : zhTW

  useEffect(() => {
    fetchTrip()
  }, [tripId])

  const fetchTrip = async () => {
    try {
      const res = await fetch(`/api/trips/${tripId}`)
      if (!res.ok) {
        router.push("/")
        return
      }
      const data = await res.json()
      setTrip(data)
    } catch {
      router.push("/")
    } finally {
      setLoading(false)
    }
  }

  if (loading || !trip) {
    return (
      <div style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Loader2 size={32} style={{ animation: 'spin 1s linear infinite', color: 'var(--color-primary)' }} />
      </div>
    )
  }

  const todayExpenses = trip.expenses.filter(e => isToday(new Date(e.date)))
  const todayTotal = todayExpenses.reduce((sum, e) => sum + e.amount, 0)
  const totalDays = differenceInDays(new Date(trip.endDate), new Date(trip.startDate)) + 1
  const daysPassed = Math.max(0, differenceInDays(new Date(), new Date(trip.startDate)) + 1)
  const budget = trip.budgetAmount || 0
  const canEdit = trip.userRole !== 'viewer'

  // 分類統計
  const categoryStats = EXPENSE_CATEGORIES.map(cat => {
    const expenses = trip.expenses.filter(e => e.category === cat.value)
    const total = expenses.reduce((sum, e) => sum + e.amount, 0)
    return { ...cat, label: t(`cat.${cat.value}`), total, count: expenses.length }
  }).filter(c => c.count > 0).sort((a, b) => b.total - a.total)

  const displayExpenses = showAllExpenses ? trip.expenses : trip.expenses.slice(0, 10)

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
          <Link href="/" style={{
            display: 'inline-flex', alignItems: 'center', gap: '0.375rem',
            color: 'var(--text-muted)', textDecoration: 'none', fontSize: '0.85rem',
          }}>
            <ArrowLeft size={16} />
            {t('trip.back')}
          </Link>
          {trip.userRole === 'owner' && (
            <Link href={`/trips/${tripId}/settings`} style={{
              display: 'flex', alignItems: 'center', gap: '0.375rem',
              color: 'var(--text-muted)', textDecoration: 'none', fontSize: '0.85rem',
            }}>
              <Settings size={16} />
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
            <div>
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

        {/* 預算進度條 */}
        {budget > 0 && (
          <div className="glass-card animate-fade-in-up animate-delay-100" style={{
            padding: '1.5rem',
            marginBottom: '1rem',
          }}>
            <BudgetProgress
              totalBudget={budget}
              totalSpent={trip.totalSpent}
              currency={trip.defaultCurrency}
              size="lg"
            />
            {trip.totalSpent > 0 && totalDays > 0 && (
              <div style={{
                display: 'flex', justifyContent: 'space-between',
                marginTop: '0.75rem', fontSize: '0.8rem', color: 'var(--text-muted)',
                flexWrap: 'wrap', gap: '0.5rem',
              }}>
                <span>
                  {t('trip.avgDaily')} {getCurrencySymbol(trip.defaultCurrency)}
                  {Math.round(trip.totalSpent / Math.max(daysPassed, 1)).toLocaleString()}
                </span>
                {budget - trip.totalSpent > 0 && (
                  <span>
                    {t('trip.burnRate', { days: ((budget - trip.totalSpent) / (trip.totalSpent / Math.max(daysPassed, 1))).toFixed(1) })}
                  </span>
                )}
              </div>
            )}
          </div>
        )}

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
            onSubmit={() => { setShowExpenseForm(false); fetchTrip() }}
          />
        )}

        {/* 今日花費 */}
        {todayExpenses.length > 0 && (
          <div className="glass-card animate-fade-in-up animate-delay-300" style={{
            padding: '1.25rem',
            marginBottom: '1rem',
          }}>
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              marginBottom: '0.75rem',
            }}>
              <h3 style={{ fontSize: '0.9rem', fontWeight: 700 }}>
                {t('trip.today')}
              </h3>
              <span style={{
                fontSize: '1rem', fontWeight: 700, color: 'var(--color-primary-light)',
              }}>
                {getCurrencySymbol(trip.defaultCurrency)}{todayTotal.toLocaleString()}
              </span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {todayExpenses.map(expense => (
                <ExpenseRow key={expense.id} expense={expense} currency={trip.defaultCurrency} />
              ))}
            </div>
          </div>
        )}

        {/* 分類統計 */}
        {categoryStats.length > 0 && (
          <div className="glass-card animate-fade-in-up animate-delay-300" style={{
            padding: '1.25rem',
            marginBottom: '1rem',
          }}>
            <h3 style={{ fontSize: '0.9rem', fontWeight: 700, marginBottom: '0.75rem' }}>
              {t('trip.categories')}
            </h3>
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
                      {getCurrencySymbol(trip.defaultCurrency)}{cat.total.toLocaleString()}
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

        {/* 全部花費列表 */}
        {trip.expenses.length > 0 && (
          <div className="glass-card" style={{
            padding: '1.25rem',
            marginBottom: '1rem',
          }}>
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              marginBottom: '0.75rem',
            }}>
              <h3 style={{ fontSize: '0.9rem', fontWeight: 700 }}>
                {t('trip.allExpenses', { count: String(trip.expenses.length) })}
              </h3>
              <span style={{
                fontSize: '1rem', fontWeight: 700, color: 'var(--color-primary-light)',
              }}>
                {getCurrencySymbol(trip.defaultCurrency)}{trip.totalSpent.toLocaleString()}
              </span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {displayExpenses.map(expense => (
                <ExpenseRow key={expense.id} expense={expense} currency={trip.defaultCurrency} />
              ))}
            </div>
            {trip.expenses.length > 10 && (
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
                  <><ChevronDown size={16} />{t('trip.showAll', { count: String(trip.expenses.length) })}</>
                )}
              </button>
            )}
          </div>
        )}


      </main>
    </div>
  )
}

// === 花費列表行 ===
function ExpenseRow({ expense, currency }: {
  expense: TripData['expenses'][0]
  currency: string
}) {
  const cat = getCategoryInfo(expense.category)
  const { t } = useLanguage()
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '0.5rem 0.75rem',
      borderRadius: 'var(--radius)',
      background: 'var(--bg-card-hover)',
      transition: 'background 0.2s',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flex: 1, minWidth: 0 }}>
        <span className="category-badge" style={{
          background: `${cat.color}18`,
          color: cat.color,
          flexShrink: 0,
        }}>
          {t(`cat.${expense.category}`)}
        </span>
        <div style={{ minWidth: 0 }}>
          <div style={{
            fontSize: '0.85rem', fontWeight: 500,
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>
            {expense.item}
          </div>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
            {expense.user.name} · {format(new Date(expense.date), 'M/d HH:mm')}
            {expense.source === 'line' && ' · 📱'}
          </div>
        </div>
      </div>
      <div style={{ flexShrink: 0, marginLeft: '0.5rem', textAlign: 'right' }}>
        <span style={{
          fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-primary)',
        }}>
          {getCurrencySymbol(currency)}{expense.amount.toLocaleString()}
        </span>
        {expense.convertedAmount && expense.currency !== 'TWD' && (
          <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: '1px' }}>
            ≈ NT${expense.convertedAmount.toLocaleString()}
            {expense.exchangeRate && (
              <span> · ×{expense.exchangeRate}</span>
            )}
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
  onSubmit: () => void
}) {
  // 行程國家對應的幣種（不重複）
  const tripCurrencies = getCurrenciesFromCountries(countries)
  // 確保基準幣種也在 chip 裡（例如 TWD）
  const chipCurrencies = [...tripCurrencies]
  if (baseCurrency && !chipCurrencies.includes(baseCurrency)) {
    chipCurrencies.push(baseCurrency)
  }
  // 非 chip 的其他幣種
  const otherCurrencies = Object.keys(ALL_CURRENCIES).filter(c => !chipCurrencies.includes(c))
  const { t } = useLanguage()

  const [mode, setMode] = useState<'expense' | 'deposit'>('expense')
  const [form, setForm] = useState({
    category: 'food',
    item: '',
    amount: '',
    currency: tripCurrencies[0] || defaultCurrency,
    note: '',
  })
  const [loading, setLoading] = useState(false)

  // 即時匯率預覽
  const [previewRate, setPreviewRate] = useState<number | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [rateUpdatedAt, setRateUpdatedAt] = useState<string | null>(null)
  // 讀取偏好幣種
  const [preferredCur, setPreferredCur] = useState('TWD')
  useEffect(() => {
    const saved = localStorage.getItem('preferredCurrency')
    if (saved) setPreferredCur(saved)
  }, [])

  // 當幣種或金額變動時查詢匯率
  useEffect(() => {
    if (form.currency === preferredCur || !form.amount) {
      setPreviewRate(null)
      return
    }
    let cancelled = false
    const fetchRate = async () => {
      setPreviewLoading(true)
      try {
        // 走後端 proxy（避免暴露 API key）
        const res = await fetch(`/api/exchange-rate?base=${form.currency}&target=${preferredCur}`)
        if (!res.ok) return
        const data = await res.json()
        if (!cancelled && data.rate) {
          setPreviewRate(data.rate)
          // 解析匯率更新時間（UTC → UTC+8）
          if (data.updatedAt) {
            const utcDate = new Date(data.updatedAt)
            const tw = new Intl.DateTimeFormat('zh-TW', {
              timeZone: 'Asia/Taipei',
              month: '2-digit', day: '2-digit',
              hour: '2-digit', minute: '2-digit',
              hour12: false,
            }).format(utcDate)
            setRateUpdatedAt(tw)
          }
        }
      } catch { /* 靜默失敗 */ } finally {
        if (!cancelled) setPreviewLoading(false)
      }
    }
    // 300ms debounce
    const timer = setTimeout(fetchRate, 300)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [form.currency, form.amount, preferredCur])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      const url = mode === 'expense'
        ? `/api/trips/${tripId}/expenses`
        : `/api/trips/${tripId}/deposits`
      const body = mode === 'expense'
        ? { ...form, amount: parseFloat(form.amount) }
        : { amount: parseFloat(form.amount), currency: form.currency, note: form.note || form.item }
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (res.ok) onSubmit()
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
            placeholder={isExpense ? t('form.item.placeholder') : t('form.note.placeholder')}
            required={isExpense}
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
                {getCurrencyChipLabel(cur, countries)}
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

        {/* 備註（僅支出模式）*/}
        {isExpense && (
          <input
            className="input-field"
            value={form.note}
            onChange={(e) => setForm({ ...form, note: e.target.value })}
            placeholder={t('form.note')}
          />
        )}

        <button
          type="submit"
          className="btn-primary"
          disabled={loading}
          style={{
            justifyContent: 'center', padding: '0.625rem',
            opacity: loading ? 0.7 : 1,
            background: isExpense ? undefined : 'linear-gradient(135deg, var(--color-success), #16a34a)',
          }}
        >
          {loading ? (
            <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
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
