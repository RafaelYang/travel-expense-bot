/** 首頁互動區塊；行程資料由 Server Component 預先載入。 */
"use client"

import { useRouter } from "next/navigation"
import { useState } from "react"
import { Navbar } from "@/components/navbar"
import { BudgetProgress } from "@/components/budget-progress"
import { useLanguage } from "@/components/language-provider"
import { PlusCircle, Users, Calendar, TicketCheck, ArrowRight, Loader2 } from "lucide-react"
import Link from "next/link"
import { format } from "date-fns"
import { zhTW, enUS } from "date-fns/locale"
import { getCurrencySymbol } from "@/lib/utils"
import { getCountryCoverImage, getCountryFlags } from "@/lib/countries"
import type { DashboardTrip } from "@/lib/trip-dashboard"

type Trip = DashboardTrip

export default function HomeClient({
  initialTrips,
  userName,
}: {
  initialTrips: DashboardTrip[]
  userName: string
}) {
  const router = useRouter()
  const { t } = useLanguage()
  const trips: Trip[] = initialTrips
  const [joinCode, setJoinCode] = useState("")
  const [joinError, setJoinError] = useState("")
  const [joining, setJoining] = useState(false)

  const handleJoinTrip = async (e: React.FormEvent) => {
    e.preventDefault()
    setJoinError("")
    setJoining(true)

    try {
      const res = await fetch("/api/trips/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: joinCode.toUpperCase() }),
      })
      const data = await res.json()

      if (!res.ok) {
        setJoinError(data.error)
        return
      }

      setJoinCode("")
      router.push(`/trips/${data.tripId}`)
    } catch {
      setJoinError(t('home.join.error'))
    } finally {
      setJoining(false)
    }
  }

  // 進行中的行程置頂，其餘按日期新到舊
  const activeTrips = trips.filter(t => t.status === 'active')
  const otherTrips = trips.filter(t => t.status !== 'active')

  return (
    <div style={{ minHeight: '100vh', paddingBottom: '5rem' }}>
      <Navbar />

      <main style={{
        maxWidth: '800px',
        margin: '0 auto',
        padding: '1.5rem',
        position: 'relative',
        zIndex: 1,
      }}>
        {/* 歡迎區塊 */}
        <div className="animate-fade-in-up" style={{ marginBottom: '2rem' }}>
          <h1 style={{
            fontSize: 'clamp(1.5rem, 4vw, 2rem)',
            fontWeight: 800,
            letterSpacing: '-0.03em',
            marginBottom: '0.5rem',
          }}>
            {t('home.greeting', { name: userName })}
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
            {t('home.subtitle')}
          </p>
        </div>

        {/* 快速操作區 */}
        <div className="animate-fade-in-up animate-delay-100" style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: '1rem',
          marginBottom: '2rem',
        }}>
          {/* 新增行程 */}
          <Link href="/trips/new" className="glass-card" style={{
            padding: '1.25rem',
            display: 'flex',
            alignItems: 'center',
            gap: '1rem',
            textDecoration: 'none',
            color: 'var(--text-primary)',
            cursor: 'pointer',
          }}>
            <div style={{
              width: '48px',
              height: '48px',
              borderRadius: '12px',
              background: 'linear-gradient(135deg, rgba(14, 165, 233, 0.2), rgba(14, 165, 233, 0.05))',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}>
              <PlusCircle size={22} style={{ color: 'var(--color-primary)' }} />
            </div>
            <div>
              <div style={{ fontWeight: 600, marginBottom: '0.125rem' }}>{t('home.newTrip')}</div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{t('home.newTrip.desc')}</div>
            </div>
          </Link>

          {/* 加入行程 */}
          <form onSubmit={handleJoinTrip} className="glass-card" style={{
            padding: '1.25rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
          }}>
            <div style={{
              width: '48px',
              height: '48px',
              borderRadius: '12px',
              background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.2), rgba(139, 92, 246, 0.05))',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}>
              <TicketCheck size={22} style={{ color: 'var(--color-accent)' }} />
            </div>
            <div style={{ flex: 1 }}>
              <input
                className="input-field"
                placeholder={t('home.inviteCode')}
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                maxLength={6}
                style={{
                  fontSize: '0.85rem',
                  padding: '0.5rem 0.75rem',
                  textTransform: 'uppercase',
                  letterSpacing: '0.1em',
                  fontWeight: 600,
                }}
              />
              {joinError && (
                <div style={{ fontSize: '0.7rem', color: 'var(--color-danger)', marginTop: '0.25rem' }}>
                  {joinError}
                </div>
              )}
            </div>
            <button
              type="submit"
              className="btn-primary"
              disabled={joining || joinCode.length !== 6}
              style={{
                padding: '0.5rem 0.75rem',
                opacity: joining || joinCode.length !== 6 ? 0.5 : 1,
              }}
            >
              {joining ? <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> : t('home.join')}
            </button>
          </form>
        </div>

        {/* 進行中的行程 */}
        {activeTrips.length > 0 && (
          <section className="animate-fade-in-up animate-delay-200" style={{ marginBottom: '2.5rem' }}>
            <h2 style={{
              fontSize: '1.125rem',
              fontWeight: 700,
              marginBottom: '1rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
            }}>
              <span style={{ fontSize: '1.25rem' }}>✈️</span>
              {t('home.section.active')}
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {activeTrips.map((trip) => (
                <TripCard key={trip.id} trip={trip} featured />
              ))}
            </div>
          </section>
        )}

        {/* 其他行程 */}
        {otherTrips.length > 0 && (
          <section className="animate-fade-in-up animate-delay-300">
            <h2 style={{
              fontSize: '1.125rem',
              fontWeight: 700,
              marginBottom: '1rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
            }}>
              <span style={{ fontSize: '1.25rem' }}>📋</span>
              {t('home.section.all')}
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {otherTrips.map((trip) => (
                <TripCard key={trip.id} trip={trip} />
              ))}
            </div>
          </section>
        )}

        {/* 空狀態 */}
        {trips.length === 0 && (
          <div className="animate-fade-in-up" style={{
            textAlign: 'center',
            padding: '4rem 2rem',
          }}>
            <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>🌏</div>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '0.5rem' }}>
              {t('home.empty')}
            </h2>
            <p style={{ color: 'var(--text-muted)', marginBottom: '1.5rem' }}>
              {t('home.empty.desc')}
            </p>
            <Link href="/trips/new" className="btn-primary">
              <PlusCircle size={18} />
              {t('home.createFirst')}
            </Link>
          </div>
        )}
      </main>
    </div>
  )
}

// 行程卡片子元件 — 全寬 + 城市背景照
function TripCard({ trip, featured }: { trip: Trip; featured?: boolean }) {
  const { t, locale } = useLanguage()
  const dateLocale = locale === 'en' ? enUS : zhTW
  const coverImage = trip.coverImage || getCountryCoverImage(trip.countries || [])
  const flags = getCountryFlags(trip.countries || [])

  return (
    <Link
      href={`/trips/${trip.id}`}
      style={{
        display: 'block',
        textDecoration: 'none',
        color: 'var(--text-primary)',
        cursor: 'pointer',
        borderRadius: 'var(--radius-lg)',
        overflow: 'hidden',
        position: 'relative',
        minHeight: featured ? '200px' : '160px',
      }}
      className={featured ? 'pulse-glow' : ''}
    >
      {/* 背景圖片 */}
      <div style={{
        position: 'absolute',
        inset: 0,
        backgroundImage: `url(${coverImage})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        transition: 'transform 0.4s ease',
      }} className="trip-card-bg" />

      {/* 暗化遮罩（確保文字可讀） */}
      <div style={{
        position: 'absolute',
        inset: 0,
        background: 'linear-gradient(135deg, rgba(0,0,0,0.65) 0%, rgba(0,0,0,0.35) 50%, rgba(0,0,0,0.55) 100%)',
      }} />

      {/* 內容 */}
      <div style={{
        position: 'relative',
        zIndex: 1,
        padding: featured ? '1.5rem' : '1.25rem',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        height: '100%',
        minHeight: featured ? '200px' : '160px',
      }}>
        {/* 上半部：標題 + 狀態 */}
        <div>
          <div>
            <h3 style={{
              fontSize: featured ? '1.4rem' : '1.15rem',
              fontWeight: 800,
              marginBottom: '0.375rem',
              letterSpacing: '-0.01em',
              color: 'white',
              textShadow: '0 1px 4px rgba(0,0,0,0.4)',
            }}>
              {flags && <span style={{ marginRight: '0.5rem' }}>{flags}</span>}
              {trip.name}
            </h3>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.75rem',
              fontSize: '0.9rem',
              color: 'rgba(255,255,255,0.85)',
            }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                <Calendar size={13} />
                {format(new Date(trip.startDate), 'yyyy/M/d', { locale: dateLocale })} - {format(new Date(trip.endDate), 'yyyy/M/d', { locale: dateLocale })}
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                <Users size={13} />
                {t('home.card.people', { count: String(trip.members.length) })}
              </span>
            </div>
          </div>
        </div>

        {/* 預算進度（進行中的行程才顯示） */}
        {featured && trip.budgetAmount && trip.budgetAmount > 0 && (
          <div style={{
            margin: '0.75rem 0',
            background: 'rgba(0,0,0,0.3)',
            borderRadius: 'var(--radius)',
            padding: '0.75rem',
            backdropFilter: 'blur(4px)',
          }}>
            <BudgetProgress
              totalBudget={trip.budgetAmount}
              totalSpent={trip.totalSpent}
              currency={trip.defaultCurrency}
              showLabels={true}
              size="sm"
            />
          </div>
        )}

        {/* 底部資訊 */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <span style={{
            fontSize: '0.8rem',
            color: 'rgba(255,255,255,0.75)',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
          }}>
            {t('home.card.expenses', { count: String(trip._count.expenses) })}
            {trip.totalSpent > 0 && (
              <span style={{
                fontWeight: 700,
                color: 'rgba(255,255,255,0.95)',
              }} title={(trip.missingConversionCount || 0) > 0
                ? t('home.total.incomplete', { count: String(trip.missingConversionCount) })
                : undefined}>
                · {getCurrencySymbol(trip.baseCurrency)}{trip.totalSpent.toLocaleString()}
                {(trip.missingConversionCount || 0) > 0 ? ' *' : ''}
              </span>
            )}
          </span>
          <span style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.25rem',
            fontSize: '0.8rem',
            color: 'rgba(255,255,255,0.9)',
            fontWeight: 600,
            background: 'rgba(255,255,255,0.15)',
            padding: '0.3rem 0.75rem',
            borderRadius: '9999px',
            backdropFilter: 'blur(4px)',
          }}>
            {t('home.card.detail')} <ArrowRight size={14} />
          </span>
        </div>
      </div>
    </Link>
  )
}
