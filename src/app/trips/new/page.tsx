/**
 * 新增行程頁面
 */
"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useSession } from "next-auth/react"
import { Navbar } from "@/components/navbar"
import { PlusCircle, ArrowLeft, Plane, Calendar, DollarSign, Loader2 } from "lucide-react"
import Link from "next/link"
import { CURRENCIES } from "@/lib/utils"

export default function NewTripPage() {
  const { data: session } = useSession()
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  const [form, setForm] = useState({
    name: "",
    description: "",
    startDate: "",
    endDate: "",
    defaultCurrency: "JPY",
    baseCurrency: "TWD",
    budgetAmount: "",
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setLoading(true)

    try {
      const res = await fetch("/api/trips", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          budgetAmount: form.budgetAmount ? parseFloat(form.budgetAmount) : undefined,
        }),
      })

      const data = await res.json()
      if (!res.ok) {
        setError(data.error || "建立失敗")
        return
      }

      router.push(`/trips/${data.id}`)
    } catch {
      setError("建立失敗，請稍後再試")
    } finally {
      setLoading(false)
    }
  }

  if (!session) return null

  return (
    <div style={{ minHeight: '100vh', paddingBottom: '5rem' }}>
      <Navbar />

      <main style={{
        maxWidth: '600px',
        margin: '0 auto',
        padding: '1.5rem',
        position: 'relative',
        zIndex: 1,
      }}>
        {/* 返回 */}
        <Link href="/" style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '0.375rem',
          color: 'var(--text-muted)',
          textDecoration: 'none',
          fontSize: '0.85rem',
          marginBottom: '1.5rem',
          transition: 'color 0.2s',
        }}>
          <ArrowLeft size={16} />
          返回行程列表
        </Link>

        <div className="glass-card animate-fade-in-up" style={{ padding: '2rem' }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            marginBottom: '1.5rem',
          }}>
            <div style={{
              width: '48px', height: '48px',
              borderRadius: '12px',
              background: 'linear-gradient(135deg, rgba(14, 165, 233, 0.2), rgba(139, 92, 246, 0.2))',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Plane size={22} style={{ color: 'var(--color-primary)' }} />
            </div>
            <div>
              <h1 style={{ fontSize: '1.25rem', fontWeight: 700 }}>新增行程</h1>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>填寫旅行基本資訊</p>
            </div>
          </div>

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            {error && (
              <div style={{
                padding: '0.75rem', borderRadius: 'var(--radius)',
                background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)',
                color: '#fca5a5', fontSize: '0.8rem',
              }}>
                {error}
              </div>
            )}

            {/* 行程名稱 */}
            <div>
              <label style={{
                display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)',
                marginBottom: '0.375rem', fontWeight: 500,
              }}>
                行程名稱 *
              </label>
              <input
                className="input-field"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="例：2026 東京自由行"
                required
                autoFocus
              />
            </div>

            {/* 描述 */}
            <div>
              <label style={{
                display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)',
                marginBottom: '0.375rem', fontWeight: 500,
              }}>
                描述
              </label>
              <textarea
                className="input-field"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="行程簡介（選填）"
                rows={2}
                style={{ resize: 'vertical' }}
              />
            </div>

            {/* 日期 */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '1rem',
            }}>
              <div>
                <label style={{
                  display: 'flex', alignItems: 'center', gap: '0.25rem',
                  fontSize: '0.8rem', color: 'var(--text-secondary)',
                  marginBottom: '0.375rem', fontWeight: 500,
                }}>
                  <Calendar size={13} />
                  出發日期 *
                </label>
                <input
                  type="date"
                  className="input-field"
                  value={form.startDate}
                  onChange={(e) => setForm({ ...form, startDate: e.target.value })}
                  required
                  style={{ colorScheme: 'dark' }}
                />
              </div>
              <div>
                <label style={{
                  display: 'flex', alignItems: 'center', gap: '0.25rem',
                  fontSize: '0.8rem', color: 'var(--text-secondary)',
                  marginBottom: '0.375rem', fontWeight: 500,
                }}>
                  <Calendar size={13} />
                  回程日期 *
                </label>
                <input
                  type="date"
                  className="input-field"
                  value={form.endDate}
                  onChange={(e) => setForm({ ...form, endDate: e.target.value })}
                  required
                  style={{ colorScheme: 'dark' }}
                />
              </div>
            </div>

            {/* 幣種 */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '1rem',
            }}>
              <div>
                <label style={{
                  display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)',
                  marginBottom: '0.375rem', fontWeight: 500,
                }}>
                  花費幣種
                </label>
                <select
                  className="input-field"
                  value={form.defaultCurrency}
                  onChange={(e) => setForm({ ...form, defaultCurrency: e.target.value })}
                >
                  {CURRENCIES.map(c => (
                    <option key={c.value} value={c.value}>{c.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={{
                  display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)',
                  marginBottom: '0.375rem', fontWeight: 500,
                }}>
                  基準幣種（換算用）
                </label>
                <select
                  className="input-field"
                  value={form.baseCurrency}
                  onChange={(e) => setForm({ ...form, baseCurrency: e.target.value })}
                >
                  {CURRENCIES.map(c => (
                    <option key={c.value} value={c.value}>{c.label}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* 預算 */}
            <div>
              <label style={{
                display: 'flex', alignItems: 'center', gap: '0.25rem',
                fontSize: '0.8rem', color: 'var(--text-secondary)',
                marginBottom: '0.375rem', fontWeight: 500,
              }}>
                <DollarSign size={13} />
                預算上限（選填）
              </label>
              <input
                type="number"
                className="input-field"
                value={form.budgetAmount}
                onChange={(e) => setForm({ ...form, budgetAmount: e.target.value })}
                placeholder={`以花費幣種計算，例：200000`}
                min="0"
                step="1"
              />
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                設定後會顯示預算進度條動畫
              </div>
            </div>

            <button
              type="submit"
              className="btn-primary"
              disabled={loading}
              style={{
                width: '100%', justifyContent: 'center',
                padding: '0.75rem', fontSize: '0.9rem',
                marginTop: '0.5rem',
                opacity: loading ? 0.7 : 1,
              }}
            >
              {loading ? (
                <Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} />
              ) : (
                <>
                  <PlusCircle size={18} />
                  建立行程
                </>
              )}
            </button>
          </form>
        </div>
      </main>
    </div>
  )
}
