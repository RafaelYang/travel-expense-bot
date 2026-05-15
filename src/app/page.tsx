/**
 * 首頁 — 行程總覽 Dashboard
 */
"use client"

import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { Navbar } from "@/components/navbar"
import { BudgetProgress } from "@/components/budget-progress"
import { Plane, PlusCircle, Users, Calendar, TicketCheck, ArrowRight, Loader2 } from "lucide-react"
import Link from "next/link"
import { format } from "date-fns"
import { zhTW } from "date-fns/locale"
import { getCurrencySymbol, TRIP_STATUS } from "@/lib/utils"

interface Trip {
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
  members: { user: { id: string; name: string; image?: string } }[]
  _count: { expenses: number }
}

export default function HomePage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [trips, setTrips] = useState<Trip[]>([])
  const [loading, setLoading] = useState(true)
  const [joinCode, setJoinCode] = useState("")
  const [joinError, setJoinError] = useState("")
  const [joining, setJoining] = useState(false)

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login")
    }
  }, [status, router])

  useEffect(() => {
    if (session) {
      fetchTrips()
    }
  }, [session])

  const fetchTrips = async () => {
    try {
      const res = await fetch("/api/trips")
      const data = await res.json()
      setTrips(data)
    } catch (error) {
      console.error("Fetch trips error:", error)
    } finally {
      setLoading(false)
    }
  }

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
      setJoinError("加入失敗")
    } finally {
      setJoining(false)
    }
  }

  if (status === "loading" || !session) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        <Loader2 size={32} style={{ animation: 'spin 1s linear infinite', color: 'var(--color-primary)' }} />
      </div>
    )
  }

  const activeTrips = trips.filter(t => t.status === 'active')
  const otherTrips = trips.filter(t => t.status !== 'active')

  return (
    <div style={{ minHeight: '100vh', paddingBottom: '5rem' }}>
      <Navbar />

      <main style={{
        maxWidth: '1000px',
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
            哈囉，{session.user?.name || '旅人'} 👋
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
            準備好記錄下一趟旅程了嗎？
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
              <div style={{ fontWeight: 600, marginBottom: '0.125rem' }}>新增行程</div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>建立新的旅行記帳</div>
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
                placeholder="輸入邀請碼"
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
              {joining ? <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> : '加入'}
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
              進行中
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
              所有行程
            </h2>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
              gap: '1rem',
            }}>
              {otherTrips.map((trip) => (
                <TripCard key={trip.id} trip={trip} />
              ))}
            </div>
          </section>
        )}

        {/* 空狀態 */}
        {!loading && trips.length === 0 && (
          <div className="animate-fade-in-up" style={{
            textAlign: 'center',
            padding: '4rem 2rem',
          }}>
            <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>🌏</div>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '0.5rem' }}>
              還沒有行程呢
            </h2>
            <p style={{ color: 'var(--text-muted)', marginBottom: '1.5rem' }}>
              建立一個行程，或是用邀請碼加入朋友的行程吧！
            </p>
            <Link href="/trips/new" className="btn-primary">
              <PlusCircle size={18} />
              建立第一個行程
            </Link>
          </div>
        )}
      </main>
    </div>
  )
}

// 行程卡片子元件
function TripCard({ trip, featured }: { trip: Trip; featured?: boolean }) {
  const statusInfo = TRIP_STATUS[trip.status as keyof typeof TRIP_STATUS] || TRIP_STATUS.planning

  return (
    <Link
      href={`/trips/${trip.id}`}
      className={`glass-card ${featured ? 'pulse-glow' : ''}`}
      style={{
        display: 'block',
        padding: featured ? '1.5rem' : '1.25rem',
        textDecoration: 'none',
        color: 'var(--text-primary)',
        cursor: 'pointer',
      }}
    >
      {/* 標題行 */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: '0.75rem',
      }}>
        <div>
          <h3 style={{
            fontSize: featured ? '1.25rem' : '1rem',
            fontWeight: 700,
            marginBottom: '0.25rem',
            letterSpacing: '-0.01em',
          }}>
            {trip.name}
          </h3>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            fontSize: '0.75rem',
            color: 'var(--text-muted)',
          }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
              <Calendar size={12} />
              {format(new Date(trip.startDate), 'M/d', { locale: zhTW })} - {format(new Date(trip.endDate), 'M/d', { locale: zhTW })}
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
              <Users size={12} />
              {trip.members.length} 人
            </span>
          </div>
        </div>
        <span style={{
          fontSize: '0.7rem',
          padding: '0.2rem 0.5rem',
          borderRadius: '9999px',
          background: `${statusInfo.color}20`,
          color: statusInfo.color,
          fontWeight: 600,
          whiteSpace: 'nowrap',
        }}>
          {statusInfo.label}
        </span>
      </div>

      {/* 預算進度（進行中的行程才顯示） */}
      {trip.budgetAmount && trip.budgetAmount > 0 && (
        <div style={{ marginBottom: '0.75rem' }}>
          <BudgetProgress
            totalBudget={trip.budgetAmount}
            totalSpent={trip.totalSpent}
            currency={trip.defaultCurrency}
            showLabels={featured}
            size={featured ? 'md' : 'sm'}
          />
        </div>
      )}

      {/* 底部資訊 */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}>
        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
          {trip._count.expenses} 筆花費
        </span>
        <span style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.25rem',
          fontSize: '0.8rem',
          color: 'var(--color-primary)',
          fontWeight: 500,
        }}>
          查看詳情 <ArrowRight size={14} />
        </span>
      </div>
    </Link>
  )
}
