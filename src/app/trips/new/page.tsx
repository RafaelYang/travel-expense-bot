/**
 * 新增行程頁面
 * - 選擇目的地國家（多選 chip）
 * - 基準幣種（換算用）
 */
"use client"

import { useState, useMemo, useEffect } from "react"
import { useRouter } from "next/navigation"
import { useSession } from "next-auth/react"
import { Navbar } from "@/components/navbar"
import { useLanguage } from "@/components/language-provider"
import { PlusCircle, ArrowLeft, Plane, Search, X, Loader2 } from "lucide-react"
import Link from "next/link"
import { COUNTRIES, type Country } from "@/lib/countries"
import { CURRENCIES } from "@/lib/utils"

export default function NewTripPage() {
  const { data: session } = useSession()
  const router = useRouter()
  const { t } = useLanguage()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [countrySearch, setCountrySearch] = useState("")
  const [showCountryPicker, setShowCountryPicker] = useState(false)

  const [form, setForm] = useState({
    name: "",
    description: "",
    startDate: "",
    endDate: "",
    countries: [] as string[],
    baseCurrency: "TWD",
  })

  // 讀取偏好幣種作為預設基準幣種
  useEffect(() => {
    const saved = typeof window !== 'undefined' ? localStorage.getItem('preferredCurrency') : null
    if (saved) setForm(f => ({ ...f, baseCurrency: saved }))
  }, [])

  // 搜尋過濾國家
  const filteredCountries = useMemo(() => {
    if (!countrySearch.trim()) return COUNTRIES
    const q = countrySearch.toLowerCase()
    return COUNTRIES.filter(c =>
      c.name.includes(q) || c.nameEn.toLowerCase().includes(q) || c.code.toLowerCase().includes(q)
    )
  }, [countrySearch])

  // 選中的國家物件
  const selectedCountries = form.countries
    .map(code => COUNTRIES.find(c => c.code === code))
    .filter(Boolean) as Country[]

  const toggleCountry = (code: string) => {
    setForm(prev => ({
      ...prev,
      countries: prev.countries.includes(code)
        ? prev.countries.filter(c => c !== code)
        : [...prev.countries, code],
    }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setLoading(true)

    try {
      const res = await fetch("/api/trips", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      })

      const data = await res.json()
      if (!res.ok) {
        setError(data.error || t('newTrip.error'))
        return
      }

      router.push(`/trips/${data.id}`)
    } catch {
      setError(t('newTrip.error.retry'))
    } finally {
      setLoading(false)
    }
  }

  if (!session) return null

  return (
    <div style={{ minHeight: '100vh', paddingBottom: '5rem' }}>
      <Navbar />

      <main style={{
        maxWidth: '600px', margin: '0 auto', padding: '1.5rem',
        position: 'relative', zIndex: 1,
      }}>
        {/* 返回 */}
        <Link href="/" style={{
          display: 'inline-flex', alignItems: 'center', gap: '0.375rem',
          color: 'var(--text-muted)', textDecoration: 'none',
          fontSize: '0.85rem', marginBottom: '1.5rem', transition: 'color 0.2s',
        }}>
          <ArrowLeft size={16} />
          {t('newTrip.back')}
        </Link>

        <div className="glass-card animate-fade-in-up" style={{ padding: '2rem' }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem',
          }}>
            <div style={{
              width: '48px', height: '48px', borderRadius: '12px',
              background: 'linear-gradient(135deg, rgba(14, 165, 233, 0.2), rgba(139, 92, 246, 0.2))',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Plane size={22} style={{ color: 'var(--color-primary)' }} />
            </div>
            <div>
              <h1 style={{ fontSize: '1.25rem', fontWeight: 700 }}>{t('newTrip.title')}</h1>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{t('newTrip.subtitle')}</p>
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
                {t('newTrip.name')} <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <input
                className="input-field"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder={t('newTrip.name.placeholder')}
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
                {t('newTrip.description')}
              </label>
              <textarea
                className="input-field"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder={t('newTrip.description.placeholder')}
                rows={2}
                style={{ resize: 'vertical' }}
              />
            </div>

            {/* 目的地國家（多選） */}
            <div>
              <label style={{
                display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)',
                marginBottom: '0.375rem', fontWeight: 500,
              }}>
                {t('newTrip.countries')} <span style={{ color: '#ef4444' }}>*</span>
              </label>

              {/* 已選的國家 chip */}
              {selectedCountries.length > 0 && (
                <div style={{
                  display: 'flex', flexWrap: 'wrap', gap: '0.375rem', marginBottom: '0.5rem',
                }}>
                  {selectedCountries.map(country => (
                    <button
                      key={country.code}
                      type="button"
                      onClick={() => toggleCountry(country.code)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: '0.25rem',
                        padding: '0.3rem 0.625rem', borderRadius: '9999px',
                        background: 'rgba(14, 165, 233, 0.15)', border: '1px solid rgba(14, 165, 233, 0.3)',
                        color: 'var(--color-primary)', fontSize: '0.8rem',
                        fontWeight: 500, cursor: 'pointer', transition: 'all 0.15s',
                      }}
                    >
                      {country.flag} {country.name}
                      <X size={12} />
                    </button>
                  ))}
                </div>
              )}

              {/* 國家搜尋框 */}
              <div style={{ position: 'relative' }}>
                <div style={{ position: 'relative' }}>
                  <Search size={15} style={{
                    position: 'absolute', left: '0.75rem', top: '50%',
                    transform: 'translateY(-50%)', color: 'var(--text-muted)',
                  }} />
                  <input
                    className="input-field"
                    value={countrySearch}
                    onChange={(e) => { setCountrySearch(e.target.value); setShowCountryPicker(true) }}
                    onFocus={() => setShowCountryPicker(true)}
                    placeholder={t('newTrip.countries.search')}
                    style={{ paddingLeft: '2.25rem' }}
                  />
                </div>

                {/* 國家下拉列表 */}
                {showCountryPicker && (
                  <div style={{
                    position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0,
                    maxHeight: '240px', overflowY: 'auto', zIndex: 20,
                    background: 'var(--dropdown-bg)',
                    backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
                    border: '1px solid var(--border-color)', borderRadius: '10px',
                    boxShadow: '0 8px 30px rgba(0,0,0,0.12)',
                    padding: '0.25rem',
                  }}>
                    {filteredCountries.length === 0 ? (
                      <div style={{ padding: '0.75rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                        {t('newTrip.countries.empty')}
                      </div>
                    ) : (
                      filteredCountries.map(country => {
                        const isSelected = form.countries.includes(country.code)
                        return (
                          <button
                            key={country.code}
                            type="button"
                            onClick={() => { toggleCountry(country.code); setCountrySearch('') }}
                            style={{
                              width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                              padding: '0.5rem 0.625rem', borderRadius: '6px', border: 'none',
                              background: isSelected ? 'rgba(14, 165, 233, 0.1)' : 'transparent',
                              color: 'var(--text-primary)', fontSize: '0.85rem',
                              cursor: 'pointer', transition: 'background 0.1s', textAlign: 'left',
                            }}
                            onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.background = 'var(--bg-card-hover)' }}
                            onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.background = 'transparent' }}
                          >
                            <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                              <span style={{ fontSize: '1.1rem' }}>{country.flag}</span>
                              <span>{country.name}</span>
                              <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                                {country.currency}
                              </span>
                            </span>
                            {isSelected && (
                              <span style={{ color: 'var(--color-primary)', fontWeight: 600, fontSize: '0.8rem' }}>✓</span>
                            )}
                          </button>
                        )
                      })
                    )}
                  </div>
                )}
              </div>

              {/* 點擊外部關閉 */}
              {showCountryPicker && (
                <div
                  style={{ position: 'fixed', inset: 0, zIndex: 10 }}
                  onClick={() => setShowCountryPicker(false)}
                />
              )}
            </div>

            {/* 日期 */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div>
                <label style={{
                  display: 'flex', alignItems: 'center', gap: '0.25rem',
                  fontSize: '0.8rem', color: 'var(--text-secondary)',
                  marginBottom: '0.375rem', fontWeight: 500,
                }}>
                  {t('newTrip.startDate')} <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <input
                  type="date"
                  className="input-field date-input"
                  value={form.startDate}
                  onChange={(e) => setForm({ ...form, startDate: e.target.value })}
                  required
                />
              </div>
              <div>
                <label style={{
                  display: 'flex', alignItems: 'center', gap: '0.25rem',
                  fontSize: '0.8rem', color: 'var(--text-secondary)',
                  marginBottom: '0.375rem', fontWeight: 500,
                }}>
                  {t('newTrip.endDate')} <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <input
                  type="date"
                  className="input-field date-input"
                  value={form.endDate}
                  onChange={(e) => setForm({ ...form, endDate: e.target.value })}
                  required
                />
              </div>
            </div>

            {/* 基準幣種 */}
            <div>
              <label style={{
                display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)',
                marginBottom: '0.375rem', fontWeight: 500,
              }}>
                {t('newTrip.baseCurrency')}
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
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                {t('newTrip.baseCurrency.hint')}
              </div>
            </div>

            <button
              type="submit"
              className="btn-primary"
              disabled={loading || !form.name || form.countries.length === 0 || !form.startDate || !form.endDate}
              style={{
                width: '100%', justifyContent: 'center',
                padding: '0.75rem', fontSize: '0.9rem', marginTop: '0.5rem',
                opacity: (loading || !form.name || form.countries.length === 0) ? 0.7 : 1,
              }}
            >
              {loading ? (
                <Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} />
              ) : (
                <>
                  <PlusCircle size={18} />
                  {t('newTrip.create')}
                </>
              )}
            </button>
          </form>
        </div>
      </main>
    </div>
  )
}
