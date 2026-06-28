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

import { useEffect, useState, useRef, useCallback, use } from "react"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import { Navbar } from "@/components/navbar"
import { BudgetProgress } from "@/components/budget-progress"
import {
  ArrowLeft, PlusCircle, Wallet, Users, Calendar, Settings,
  ChevronDown, ChevronUp, Loader2, Trash2, X, Copy, Check,
  Send, Share2, ImagePlus, BarChart3, Pencil, Plane,
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

export default function TripPage({ params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = use(params)
  const { data: session } = useSession()
  const router = useRouter()
  const [trip, setTrip] = useState<TripData | null>(null)
  const [loading, setLoading] = useState(true)
  const [showExpenseForm, setShowExpenseForm] = useState(false)
  const [showAllExpenses, setShowAllExpenses] = useState(false)
  const [showMemberList, setShowMemberList] = useState(false)
  const [showShareModal, setShowShareModal] = useState(false)
  const [showStatsModal, setShowStatsModal] = useState(false)
  const [editingExpense, setEditingExpense] = useState<TripData['expenses'][0] | null>(null)
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
    if (prefix.length < 2) {
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

        {/* 分享邀請 Modal */}
        {showShareModal && (
          <div
            onClick={() => setShowShareModal(false)}
            style={{
              position: 'fixed', inset: 0, zIndex: 999,
              background: 'rgba(0, 0, 0, 0.5)',
              backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: '1.5rem',
              animation: 'fadeIn 0.15s ease-out',
            }}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="glass-card"
              style={{
                width: '100%', maxWidth: '380px', padding: '1.75rem',
                animation: 'fadeInDown 0.2s ease-out',
              }}
            >
              {/* Header */}
              <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                marginBottom: '1.25rem',
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
        )}

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
            onSubmit={() => { setShowExpenseForm(false); fetchTrip() }}
          />
        )}

        {/* 統計 Modal */}
        {showStatsModal && (
          <div
            onClick={() => setShowStatsModal(false)}
            style={{
              position: 'fixed', inset: 0, zIndex: 999,
              background: 'rgba(0, 0, 0, 0.5)',
              backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: '1.5rem',
              animation: 'fadeIn 0.15s ease-out',
            }}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="glass-card"
              style={{
                width: '100%', maxWidth: '420px', padding: '1.75rem',
                animation: 'fadeInDown 0.2s ease-out',
                maxHeight: '80vh', overflowY: 'auto',
              }}
            >
              {/* Header */}
              <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                marginBottom: '1.25rem',
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

              {/* 預算進度 */}
              {budget > 0 && (
                <div style={{ marginBottom: '1.25rem' }}>
                  <BudgetProgress
                    totalBudget={budget}
                    totalSpent={trip.totalSpent}
                    currency={trip.baseCurrency}
                    size="lg"
                  />
                  {trip.totalSpent > 0 && totalDays > 0 && (
                    <div style={{
                      display: 'flex', justifyContent: 'space-between',
                      marginTop: '0.75rem', fontSize: '0.8rem', color: 'var(--text-muted)',
                      flexWrap: 'wrap', gap: '0.5rem',
                    }}>
                      <span>
                        {t('trip.avgDaily')} {getCurrencySymbol(trip.baseCurrency)}
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

              {/* 今日花費 */}
              {todayExpenses.length > 0 && (
                <div style={{ marginBottom: '1.25rem' }}>
                  <div style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    marginBottom: '0.75rem',
                  }}>
                    <h4 style={{ fontSize: '0.9rem', fontWeight: 700 }}>
                      {t('trip.today')}
                    </h4>
                    <span style={{
                      fontSize: '1rem', fontWeight: 700, color: 'var(--color-primary-light)',
                    }}>
                      {getCurrencySymbol(trip.baseCurrency)}{todayTotal.toLocaleString()}
                    </span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {todayExpenses.map(expense => (
                      <ExpenseRow key={expense.id} expense={expense} currency={trip.baseCurrency} />
                    ))}
                  </div>
                </div>
              )}

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
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              }}>
                <span style={{ fontSize: '0.9rem', fontWeight: 600 }}>總花費（{trip.expenses.length} 筆）</span>
                <span style={{
                  fontSize: '1.1rem', fontWeight: 700, color: 'var(--color-primary-light)',
                }}>
                  {getCurrencySymbol(trip.baseCurrency)}{trip.totalSpent.toLocaleString()}
                </span>
              </div>
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
                {getCurrencySymbol(trip.baseCurrency)}{trip.totalSpent.toLocaleString()}
              </span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {displayExpenses.map(expense => (
                <ExpenseRow
                  key={expense.id}
                  expense={expense}
                  currency={trip.baseCurrency}
                  onEdit={canEdit ? () => setEditingExpense(expense) : undefined}
                />
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

      </main>
    </div>
  )
}

// === 花費列表行 ===
function ExpenseRow({ expense, currency, onEdit }: {
  expense: TripData['expenses'][0]
  currency: string
  onEdit?: () => void
}) {
  const cat = getCategoryInfo(expense.category)
  const { t } = useLanguage()
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
            {expense.user.name} · {format(new Date(expense.date), 'yyyy/M/d HH:mm')}
            {expense.source === 'line' && ' · 📱'}
          </div>
        </div>
      </div>
      <div style={{ flexShrink: 0, textAlign: 'right' }}>
          <span style={{
            fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-primary)',
          }}>
            {getCurrencySymbol(displayCurrency)}{expense.amount.toLocaleString()}
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
  const { locale, t } = useLanguage()

  const [mode, setMode] = useState<'expense' | 'deposit'>('expense')
  const [form, setForm] = useState({
    category: 'food',
    item: '',
    amount: '',
    currency: tripCurrencies[0] || defaultCurrency,
    note: '',
  })
  const [images, setImages] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

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
    const remaining = 3 - images.length
    const toProcess = files.slice(0, remaining)
    try {
      const compressed = await Promise.all(toProcess.map(compressImage))
      setImages(prev => [...prev, ...compressed].slice(0, 3))
    } catch { /* ignore */ }
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const removeImage = (idx: number) => {
    setImages(prev => prev.filter((_, i) => i !== idx))
  }

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
        ? { ...form, amount: parseFloat(form.amount), images }
        : { amount: parseFloat(form.amount), currency: form.currency, note: form.note || form.item }
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (res.ok) {
        setImages([])
        onSubmit()
      }
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
                {getCurrencyChipLabel(cur, countries, locale)}
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
          <>
          <input
            className="input-field"
            value={form.note}
            onChange={(e) => setForm({ ...form, note: e.target.value })}
            placeholder={t('form.note')}
          />

          {/* 圖片備註（最多 3 張） */}
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
              {images.length < 3 && (
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

          {/* Lightbox 全螢幕查看 */}
          {lightboxIndex !== null && images[lightboxIndex] && (
            <div
              onClick={() => setLightboxIndex(null)}
              style={{
                position: 'fixed', inset: 0,
                background: 'rgba(0,0,0,0.95)',
                zIndex: 9999,
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
                  position: 'absolute', top: '16px', right: '16px',
                  width: '40px', height: '40px', borderRadius: '50%',
                  background: 'rgba(255,255,255,0.2)', color: '#fff',
                  border: 'none', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  zIndex: 10010,
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
                  style={{
                    maxWidth: '100%', maxHeight: '85vh',
                    objectFit: 'contain', borderRadius: '8px',
                    boxShadow: '0 10px 40px rgba(0,0,0,0.5)',
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
          </>
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
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)
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
    const remaining = 3 - editImages.length
    const toProcess = files.slice(0, remaining)
    try {
      const compressed = await Promise.all(toProcess.map(compressImg))
      setEditImages(prev => [...prev, ...compressed].slice(0, 3))
    } catch { /* ignore */ }
    if (editFileRef.current) editFileRef.current.value = ''
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
  const tripCurrencies = getCurrenciesFromCountries(countries)
  const chipCurrencies = [...tripCurrencies]
  if (!chipCurrencies.includes('TWD')) chipCurrencies.push('TWD')
  if (!chipCurrencies.includes(defaultCurrency)) chipCurrencies.push(defaultCurrency)

  const isBusy = saving || deleting

  return (
    <>
    <div
      onClick={() => { if (!isBusy) onClose() }}
      style={{
        position: 'fixed', inset: 0, zIndex: 999,
        background: 'rgba(0, 0, 0, 0.5)',
        backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '1.5rem',
        animation: 'fadeIn 0.15s ease-out',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="glass-card"
        style={{
          width: '100%', maxWidth: '420px', padding: '1.75rem',
          animation: 'fadeInDown 0.2s ease-out',
          maxHeight: '85vh', overflowY: 'auto',
        }}
      >
        {mode === 'view' ? (
          /* ===== 詳情模式 ===== */
          <>
            {/* Header */}
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              marginBottom: '1.25rem',
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

            {/* 項目名稱 */}
            <h2 style={{
              fontSize: '1.25rem', fontWeight: 700,
              marginBottom: '0.5rem', letterSpacing: '-0.01em',
            }}>
              {expense.item}
            </h2>

            {/* 金額 */}
            <div style={{
              fontSize: '1.5rem', fontWeight: 800,
              color: 'var(--color-primary)',
              marginBottom: '0.25rem',
            }}>
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
                  {getCurrencyChipLabel(expense.currency, countries, locale)}
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
          </>
        ) : (
          /* ===== 編輯模式 ===== */
          <>
            {/* Header */}
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              marginBottom: '1.25rem',
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
                  {getCurrencyChipLabel(cur, countries, locale)}
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
              {editImages.length < 3 && (
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
                disabled={saving || !form.item || !form.amount}
                className="btn-primary"
                style={{
                  flex: 1, justifyContent: 'center', padding: '0.625rem',
                  opacity: saving ? 0.7 : 1,
                }}
              >
                {saving ? (
                  <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
                ) : (
                  <>
                    <Check size={16} /> 儲存修改
                  </>
                )}
              </button>
            </div>
          </>
        )}
      </div>
    </div>

    {/* Lightbox 全螢幕查看圖片 */}
    {lightboxIndex !== null && editImages[lightboxIndex] && (
      <div
        onClick={() => setLightboxIndex(null)}
        style={{
          position: 'fixed', inset: 0,
          background: 'rgba(0,0,0,0.95)',
          zIndex: 10000,
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
            position: 'absolute', top: '16px', right: '16px',
            width: '40px', height: '40px', borderRadius: '50%',
            background: 'rgba(255,255,255,0.2)', color: '#fff',
            border: 'none', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 10010,
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
            style={{
              maxWidth: '100%', maxHeight: '85vh',
              objectFit: 'contain', borderRadius: '8px',
              boxShadow: '0 10px 40px rgba(0,0,0,0.5)',
            }}
          />

          {/* 右箭頭 (把 ArrowLeft 旋轉 180 度當成右箭頭) */}
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





