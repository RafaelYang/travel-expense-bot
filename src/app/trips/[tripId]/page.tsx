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
import { zhTW } from "date-fns/locale"
import {
  EXPENSE_CATEGORIES, getCategoryInfo, getCurrencySymbol,
  CURRENCIES, formatCurrency, TRIP_STATUS,
} from "@/lib/utils"

interface TripData {
  id: string
  name: string
  description?: string
  startDate: string
  endDate: string
  defaultCurrency: string
  baseCurrency: string
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
  const [showDepositForm, setShowDepositForm] = useState(false)
  const [showAllExpenses, setShowAllExpenses] = useState(false)

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
    return { ...cat, total, count: expenses.length }
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
            返回
          </Link>
          {trip.userRole === 'owner' && (
            <Link href={`/trips/${tripId}/settings`} style={{
              display: 'flex', alignItems: 'center', gap: '0.375rem',
              color: 'var(--text-muted)', textDecoration: 'none', fontSize: '0.85rem',
            }}>
              <Settings size={16} />
              設定
            </Link>
          )}
        </div>

        {/* 行程標題卡片 */}
        <div className="glass-card animate-fade-in-up" style={{
          padding: '1.5rem',
          marginBottom: '1rem',
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
            <span style={{
              fontSize: '0.7rem', padding: '0.2rem 0.5rem',
              borderRadius: '9999px',
              background: `${(TRIP_STATUS[trip.status as keyof typeof TRIP_STATUS] || TRIP_STATUS.planning).color}20`,
              color: (TRIP_STATUS[trip.status as keyof typeof TRIP_STATUS] || TRIP_STATUS.planning).color,
              fontWeight: 600,
            }}>
              {(TRIP_STATUS[trip.status as keyof typeof TRIP_STATUS] || TRIP_STATUS.planning).label}
            </span>
          </div>

          <div style={{
            display: 'flex', gap: '1rem', flexWrap: 'wrap',
            fontSize: '0.8rem', color: 'var(--text-secondary)',
          }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
              <Calendar size={13} />
              {format(new Date(trip.startDate), 'yyyy/M/d', { locale: zhTW })} - {format(new Date(trip.endDate), 'M/d', { locale: zhTW })}
              （{totalDays} 天）
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
              <Users size={13} />
              {trip.members.length} 位成員
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
                  💡 平均每日 {getCurrencySymbol(trip.defaultCurrency)}
                  {Math.round(trip.totalSpent / Math.max(daysPassed, 1)).toLocaleString()}
                </span>
                {budget - trip.totalSpent > 0 && (
                  <span>
                    按此速度剩 {((budget - trip.totalSpent) / (trip.totalSpent / Math.max(daysPassed, 1))).toFixed(1)} 天
                  </span>
                )}
              </div>
            )}
          </div>
        )}

        {/* 快速操作 */}
        {canEdit && (
          <div className="animate-fade-in-up animate-delay-200" style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '0.75rem',
            marginBottom: '1rem',
          }}>
            <button
              onClick={() => { setShowExpenseForm(true); setShowDepositForm(false) }}
              className="btn-primary"
              style={{
                justifyContent: 'center',
                padding: '0.75rem',
                background: showExpenseForm
                  ? 'linear-gradient(135deg, var(--color-primary-dark), var(--color-primary))'
                  : undefined,
              }}
            >
              <PlusCircle size={18} />
              記帳
            </button>
            <button
              onClick={() => { setShowDepositForm(true); setShowExpenseForm(false) }}
              className="btn-secondary"
              style={{
                justifyContent: 'center',
                padding: '0.75rem',
                background: showDepositForm ? 'rgba(34, 197, 94, 0.15)' : undefined,
                borderColor: showDepositForm ? 'var(--color-success)' : undefined,
                color: showDepositForm ? 'var(--color-success)' : undefined,
              }}
            >
              <Wallet size={18} />
              儲值
            </button>
          </div>
        )}

        {/* 記帳表單 */}
        {showExpenseForm && (
          <ExpenseForm
            tripId={tripId}
            defaultCurrency={trip.defaultCurrency}
            onClose={() => setShowExpenseForm(false)}
            onSubmit={() => { setShowExpenseForm(false); fetchTrip() }}
          />
        )}

        {/* 儲值表單 */}
        {showDepositForm && (
          <DepositForm
            tripId={tripId}
            defaultCurrency={trip.defaultCurrency}
            onClose={() => setShowDepositForm(false)}
            onSubmit={() => { setShowDepositForm(false); fetchTrip() }}
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
                📅 今日花費
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
              📊 花費分類
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
                      background: 'rgba(51, 65, 85, 0.5)',
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
                      {cat.count}筆
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
                💰 所有花費（{trip.expenses.length} 筆）
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
                  <><ChevronUp size={16} />收起</>
                ) : (
                  <><ChevronDown size={16} />顯示全部 {trip.expenses.length} 筆</>
                )}
              </button>
            )}
          </div>
        )}

        {/* 成員列表 */}
        <div className="glass-card" style={{
          padding: '1.25rem',
        }}>
          <h3 style={{ fontSize: '0.9rem', fontWeight: 700, marginBottom: '0.75rem' }}>
            👥 成員
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {trip.members.map(member => (
              <div key={member.id} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '0.5rem 0.75rem',
                borderRadius: 'var(--radius)',
                background: 'rgba(51, 65, 85, 0.3)',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <div style={{
                    width: '32px', height: '32px', borderRadius: '50%',
                    background: 'linear-gradient(135deg, var(--color-primary), var(--color-accent))',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '0.8rem', fontWeight: 700, color: 'white',
                  }}>
                    {(member.user.name || member.user.email)?.[0]?.toUpperCase()}
                  </div>
                  <span style={{ fontSize: '0.85rem', fontWeight: 500 }}>
                    {member.user.name || member.user.email}
                  </span>
                </div>
                <span style={{
                  fontSize: '0.7rem', padding: '0.15rem 0.5rem',
                  borderRadius: '9999px',
                  background: member.role === 'owner' ? 'rgba(245, 158, 11, 0.15)' : 'rgba(100, 116, 139, 0.2)',
                  color: member.role === 'owner' ? '#fbbf24' : 'var(--text-muted)',
                  fontWeight: 500,
                }}>
                  {member.role === 'owner' ? '擁有者' : member.role === 'viewer' ? '檢視者' : '成員'}
                </span>
              </div>
            ))}
          </div>
        </div>
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
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '0.5rem 0.75rem',
      borderRadius: 'var(--radius)',
      background: 'rgba(51, 65, 85, 0.2)',
      transition: 'background 0.2s',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flex: 1, minWidth: 0 }}>
        <span className="category-badge" style={{
          background: `${cat.color}18`,
          color: cat.color,
          flexShrink: 0,
        }}>
          {cat.label}
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
      <span style={{
        fontSize: '0.9rem', fontWeight: 700,
        color: 'var(--text-primary)', flexShrink: 0, marginLeft: '0.5rem',
      }}>
        {getCurrencySymbol(currency)}{expense.amount.toLocaleString()}
      </span>
    </div>
  )
}

// === 記帳表單 ===
function ExpenseForm({ tripId, defaultCurrency, onClose, onSubmit }: {
  tripId: string
  defaultCurrency: string
  onClose: () => void
  onSubmit: () => void
}) {
  const [form, setForm] = useState({
    category: 'food',
    item: '',
    amount: '',
    currency: defaultCurrency,
    note: '',
  })
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      const res = await fetch(`/api/trips/${tripId}/expenses`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          amount: parseFloat(form.amount),
        }),
      })
      if (res.ok) onSubmit()
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="glass-card animate-fade-in-up" style={{
      padding: '1.25rem', marginBottom: '1rem',
      border: '1px solid rgba(14, 165, 233, 0.3)',
    }}>
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        marginBottom: '1rem',
      }}>
        <h3 style={{ fontSize: '0.9rem', fontWeight: 700 }}>✏️ 快速記帳</h3>
        <button onClick={onClose} style={{
          background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer',
        }}>
          <X size={18} />
        </button>
      </div>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {/* 分類選擇 */}
        <div style={{
          display: 'flex', gap: '0.5rem', flexWrap: 'wrap',
        }}>
          {EXPENSE_CATEGORIES.map(cat => (
            <button
              key={cat.value}
              type="button"
              onClick={() => setForm({ ...form, category: cat.value })}
              style={{
                padding: '0.375rem 0.75rem',
                borderRadius: '9999px',
                border: 'none',
                fontSize: '0.8rem',
                fontWeight: 500,
                cursor: 'pointer',
                background: form.category === cat.value ? `${cat.color}30` : 'rgba(51, 65, 85, 0.3)',
                color: form.category === cat.value ? cat.color : 'var(--text-secondary)',
                transition: 'all 0.2s',
              }}
            >
              {cat.label}
            </button>
          ))}
        </div>

        {/* 項目 + 金額 */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 140px',
          gap: '0.75rem',
        }}>
          <input
            className="input-field"
            value={form.item}
            onChange={(e) => setForm({ ...form, item: e.target.value })}
            placeholder="項目名稱"
            required
            autoFocus
          />
          <input
            type="number"
            className="input-field"
            value={form.amount}
            onChange={(e) => setForm({ ...form, amount: e.target.value })}
            placeholder="金額"
            required
            min="0"
            step="1"
            style={{ fontWeight: 700, textAlign: 'right' }}
          />
        </div>

        {/* 備註 */}
        <input
          className="input-field"
          value={form.note}
          onChange={(e) => setForm({ ...form, note: e.target.value })}
          placeholder="備註（選填）"
        />

        <button
          type="submit"
          className="btn-primary"
          disabled={loading}
          style={{
            justifyContent: 'center', padding: '0.625rem',
            opacity: loading ? 0.7 : 1,
          }}
        >
          {loading ? (
            <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
          ) : (
            <><PlusCircle size={16} /> 新增花費</>
          )}
        </button>
      </form>
    </div>
  )
}

// === 儲值表單 ===
function DepositForm({ tripId, defaultCurrency, onClose, onSubmit }: {
  tripId: string
  defaultCurrency: string
  onClose: () => void
  onSubmit: () => void
}) {
  const [form, setForm] = useState({
    amount: '',
    currency: defaultCurrency,
    note: '',
  })
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      const res = await fetch(`/api/trips/${tripId}/deposits`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          amount: parseFloat(form.amount),
        }),
      })
      if (res.ok) onSubmit()
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="glass-card animate-fade-in-up" style={{
      padding: '1.25rem', marginBottom: '1rem',
      border: '1px solid rgba(34, 197, 94, 0.3)',
    }}>
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        marginBottom: '1rem',
      }}>
        <h3 style={{ fontSize: '0.9rem', fontWeight: 700 }}>💰 儲值</h3>
        <button onClick={onClose} style={{
          background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer',
        }}>
          <X size={18} />
        </button>
      </div>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        <div style={{
          display: 'grid', gridTemplateColumns: '1fr 140px', gap: '0.75rem',
        }}>
          <input
            className="input-field"
            value={form.note}
            onChange={(e) => setForm({ ...form, note: e.target.value })}
            placeholder="備註（例：換匯）"
          />
          <input
            type="number"
            className="input-field"
            value={form.amount}
            onChange={(e) => setForm({ ...form, amount: e.target.value })}
            placeholder="金額"
            required
            min="0"
            step="1"
            style={{ fontWeight: 700, textAlign: 'right' }}
            autoFocus
          />
        </div>
        <button
          type="submit"
          className="btn-primary"
          disabled={loading}
          style={{
            justifyContent: 'center', padding: '0.625rem',
            background: 'linear-gradient(135deg, var(--color-success), #16a34a)',
            opacity: loading ? 0.7 : 1,
          }}
        >
          {loading ? (
            <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
          ) : (
            <><Wallet size={16} /> 儲值</>
          )}
        </button>
      </form>
    </div>
  )
}
