/**
 * 行程設定頁 — 邀請碼管理、狀態切換、成員管理
 */
"use client"

import { useCallback, useEffect, useState, use } from "react"
import { useRouter } from "next/navigation"
import { Navbar } from "@/components/navbar"
import {
  ArrowLeft, Copy, Check, PlusCircle, Trash2,
  Loader2, Settings, Users, Share2, AlertTriangle, Mail, Send,
  UserMinus,
} from "lucide-react"
import Link from "next/link"
import { useLanguage } from "@/components/language-provider"
import { getCountryCoverImage, COUNTRIES } from "@/lib/countries"
import { ALL_TRIPS_PATH } from "@/lib/active-trip"

interface TripSettings {
  id: string
  name: string
  description?: string
  startDate: string
  endDate: string
  defaultCurrency: string
  baseCurrency: string
  budgetAmount?: number
  status: string
  coverImage?: string | null
  userRole: string
  countries?: string[]
  members: {
    id: string
    role: string
    user: { id: string; name: string; email: string; image?: string }
  }[]
}

export default function TripSettingsPage({ params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = use(params)
  const router = useRouter()
  const [trip, setTrip] = useState<TripSettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [inviteCode, setInviteCode] = useState("")
  const [codeCopied, setCodeCopied] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [saving, setSaving] = useState(false)
  const [uploadingImage, setUploadingImage] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [inviteEmail, setInviteEmail] = useState("")
  const [emailSending, setEmailSending] = useState(false)
  const [emailSent, setEmailSent] = useState(false)
  const [emailError, setEmailError] = useState("")
  const [removingMember, setRemovingMember] = useState<string | null>(null)
  const { t, locale } = useLanguage()

  const [countriesList, setCountriesList] = useState<string[]>([])
  const [dailyCountries, setDailyCountries] = useState<string[]>([])

  const [editForm, setEditForm] = useState({
    name: "",
    description: "",
    startDate: "",
    endDate: "",
    baseCurrency: "",
    coverImage: "",
  })

  const fetchTrip = useCallback(async () => {
    try {
      const res = await fetch(`/api/trips/${tripId}`)
      if (!res.ok) { router.push(ALL_TRIPS_PATH); return }
      const data = await res.json()
      setTrip(data)
      setEditForm({
        name: data.name,
        description: data.description || "",
        startDate: data.startDate.split("T")[0],
        endDate: data.endDate.split("T")[0],
        baseCurrency: data.baseCurrency,
        coverImage: data.coverImage || "",
      })

      // 遞迴解包與淨化目的地國家 (防止滾雪球式嵌套髒資料)
      const cleanExtractCountries = (input: string[] | null | undefined): { list: string[], daily: string[] } => {
        if (!input || input.length === 0) return { list: [], daily: [] }
        const first = input[0]
        if (first && typeof first === "string" && first.startsWith("{")) {
          try {
            const parsed = JSON.parse(first)
            if (parsed && typeof parsed === "object") {
              if (parsed.list && parsed.list.length > 0 && typeof parsed.list[0] === "string" && parsed.list[0].startsWith("{")) {
                return cleanExtractCountries(parsed.list)
              }
              const parsedList: unknown[] = Array.isArray(parsed.list) ? parsed.list : []
              const parsedDaily: unknown[] = Array.isArray(parsed.daily) ? parsed.daily : []
              const list = parsedList.filter((c): c is string => typeof c === "string" && c.length === 2 && !c.includes("{"))
              const daily = parsedDaily.filter((c): c is string => typeof c === "string" && c.length === 2 && !c.includes("{"))
              return { list, daily }
            }
          } catch {}
        }
        const list = input.filter((c) => c.length === 2 && !c.includes("{"))
        return { list, daily: [] }
      }

      const { list: cleanList, daily: cleanDaily } = cleanExtractCountries(data.countries)
      setCountriesList(cleanList)

      if (cleanDaily.length > 0) {
        setDailyCountries(cleanDaily)
      } else {
        const start = new Date(data.startDate)
        const end = new Date(data.endDate)
        const totalDays = Math.ceil((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)) + 1
        const daily: string[] = []
        for (let i = 0; i < totalDays; i++) {
          if (cleanList.length === 1) {
            daily.push(cleanList[0])
          } else if (cleanList.length > 1) {
            const interval = totalDays / cleanList.length
            const countryIdx = Math.min(Math.floor(i / interval), cleanList.length - 1)
            daily.push(cleanList[countryIdx])
          } else {
            daily.push("TW")
          }
        }
        setDailyCountries(daily)
      }
    } catch {
      router.push(ALL_TRIPS_PATH)
    } finally {
      setLoading(false)
    }
  }, [router, tripId])

  useEffect(() => {
    const timer = window.setTimeout(() => void fetchTrip(), 0)
    return () => window.clearTimeout(timer)
  }, [fetchTrip])

  const resizeDailyCountries = (startDate: string, endDate: string) => {
    const start = new Date(startDate)
    const end = new Date(endDate)
    const totalDays = Math.ceil((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)) + 1
    if (!startDate || !endDate || !Number.isFinite(totalDays) || totalDays <= 0) return

    setDailyCountries((previous) => {
      const next = previous.slice(0, totalDays)
      const fallback = countriesList[0] || "TW"
      const lastValue = next[next.length - 1] || fallback
      while (next.length < totalDays) next.push(lastValue)
      return next
    })
  }

  const updateDate = (field: "startDate" | "endDate", value: string) => {
    const nextForm = { ...editForm, [field]: value }
    setEditForm(nextForm)
    resizeDailyCountries(nextForm.startDate, nextForm.endDate)
  }

  const generateInviteCode = async () => {
    setGenerating(true)
    try {
      const res = await fetch(`/api/trips/${tripId}/invite`, { method: "POST" })
      const data = await res.json()
      setInviteCode(data.code)
    } finally {
      setGenerating(false)
    }
  }

  const copyCode = () => {
    navigator.clipboard.writeText(inviteCode)
    setCodeCopied(true)
    setTimeout(() => setCodeCopied(false), 2000)
  }

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // 限制圖片大小以防資料庫載入過慢，例如 1.5MB
    if (file.size > 1.5 * 1024 * 1024) {
      alert(locale === 'en' ? 'Image size should be less than 1.5MB' : '上傳圖片大小限制為 1.5MB 以內唷！')
      return
    }

    setUploadingImage(true)
    const reader = new FileReader()
    reader.onload = (event) => {
      const base64 = event.target?.result as string
      if (base64) {
        setEditForm(prev => ({ ...prev, coverImage: base64 }))
      }
      setUploadingImage(false)
    }
    reader.onerror = () => {
      setUploadingImage(false)
    }
    reader.readAsDataURL(file)
  }

  const saveSettings = async () => {
    setSaving(true)
    try {
      const payload = {
        ...editForm,
        countries: [
          JSON.stringify({
            list: countriesList,
            daily: dailyCountries,
          })
        ]
      }
      await fetch(`/api/trips/${tripId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      fetchTrip()
    } finally {
      setSaving(false)
    }
  }

  const deleteTrip = async () => {
    setDeleting(true)
    try {
      await fetch(`/api/trips/${tripId}`, { method: "DELETE" })
      router.push(ALL_TRIPS_PATH)
    } finally {
      setDeleting(false)
    }
  }

  const removeMember = async (memberId: string) => {
    if (!confirm(locale === 'en' ? 'Are you sure you want to remove this member?' : '確定要移除這位成員嗎？')) return
    setRemovingMember(memberId)
    try {
      const res = await fetch(`/api/trips/${tripId}/members/${memberId}`, {
        method: 'DELETE',
      })
      if (res.ok) {
        fetchTrip()
      } else {
        const data = await res.json()
        alert(data.error || (locale === 'en' ? 'Failed to remove' : '移除失敗'))
      }
    } catch {
      alert(locale === 'en' ? 'Failed to remove' : '移除失敗')
    } finally {
      setRemovingMember(null)
    }
  }

  if (loading || !trip) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Loader2 size={32} style={{ animation: 'spin 1s linear infinite', color: 'var(--color-primary)' }} />
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', paddingBottom: '6rem' }}>
      <Navbar />

      <main style={{
        maxWidth: '600px', margin: '0 auto', padding: '1.5rem',
        position: 'relative', zIndex: 1,
      }}>
        <Link href={`/trips/${tripId}`} className="btn-nav" style={{ marginBottom: '1.5rem' }}>
          <ArrowLeft size={15} />
          {t('settings.back')}
        </Link>

        <h1 style={{
          fontSize: '1.25rem', fontWeight: 800, marginBottom: '1.5rem',
          display: 'flex', alignItems: 'center', gap: '0.5rem',
        }}>
          <Settings size={20} />
          {t('settings.title')}
        </h1>

        {/* 基本設定 */}
        <div className="glass-card" style={{ padding: '1.5rem', marginBottom: '1rem' }}>
          <h3 style={{
            fontSize: '0.9rem', fontWeight: 700, marginBottom: '1rem',
            display: 'flex', alignItems: 'center', gap: '0.5rem',
          }}>
            {t('settings.basic')}
          </h3>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.375rem', fontWeight: 500 }}>
                {t('settings.tripName')}
              </label>
              <input className="input-field" value={editForm.name}
                onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.375rem', fontWeight: 500 }}>
                  {t('settings.startDate')}
                </label>
                <input type={editForm.startDate ? "date" : "text"} placeholder={t('settings.startDate')} className="input-field date-input" value={editForm.startDate}
                  onChange={(e) => updateDate("startDate", e.target.value)}
                  onFocus={(e) => (e.target.type = "date")}
                  onBlur={(e) => { if (!e.target.value) e.target.type = "text" }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.375rem', fontWeight: 500 }}>
                  {t('settings.endDate')}
                </label>
                <input type={editForm.endDate ? "date" : "text"} placeholder={t('settings.endDate')} className="input-field date-input" value={editForm.endDate}
                  onChange={(e) => updateDate("endDate", e.target.value)}
                  onFocus={(e) => (e.target.type = "date")}
                  onBlur={(e) => { if (!e.target.value) e.target.type = "text" }} />
              </div>
            </div>

            {/* 每日目的地設定 */}
            {dailyCountries.length > 0 && (
              <div style={{ marginTop: '0.5rem', borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '1rem' }}>
                <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.5rem', fontWeight: 600 }}>
                  {t('settings.dailyCountries.title')}
                </label>
                <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '0.75rem', lineHeight: 1.4 }}>
                  {t('settings.dailyCountries.desc')}
                </p>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '200px', overflowY: 'auto', paddingRight: '0.25rem' }}>
                  {dailyCountries.map((countryCode, idx) => {
                    const dayNum = idx + 1
                    let dateLabel = ""
                    try {
                      const start = new Date(editForm.startDate)
                      const d = new Date(start.getTime() + idx * 24 * 60 * 60 * 1000)
                      dateLabel = `${d.getMonth() + 1}/${d.getDate()}`
                    } catch {}

                    return (
                      <div key={idx} style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        padding: '0.5rem 0.75rem', borderRadius: 'var(--radius)',
                        background: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.04)',
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-primary-light)' }}>
                            Day {dayNum}
                          </span>
                          <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                            ({dateLabel})
                          </span>
                        </div>

                        <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                          {countriesList.map((c) => {
                            const matchedCountry = COUNTRIES.find(item => item.code.toUpperCase() === c.toUpperCase())
                            const flag = matchedCountry?.flag || "🌐"
                            const cName = matchedCountry ? (locale === 'en' ? matchedCountry.nameEn : matchedCountry.name) : c
                            const isSelected = countryCode.toUpperCase() === c.toUpperCase()
                            return (
                              <button
                                key={c}
                                type="button"
                                onClick={() => {
                                  setDailyCountries(prev => {
                                    const next = [...prev]
                                    next[idx] = c
                                    return next
                                  })
                                }}
                                style={{
                                  padding: '0.25rem 0.5rem', borderRadius: '8px',
                                  fontSize: '0.65rem', fontWeight: isSelected ? 600 : 400,
                                  background: isSelected ? 'rgba(59, 130, 246, 0.15)' : 'rgba(255,255,255,0.02)',
                                  border: isSelected ? '1px solid rgba(59, 130, 246, 0.3)' : '1px solid rgba(255,255,255,0.05)',
                                  color: isSelected ? '#3b82f6' : 'var(--text-secondary)',
                                  cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.15rem',
                                  transition: 'all 0.15s',
                                  minHeight: 'auto'
                                }}
                              >
                                <span>{flag}</span>
                                <span>{cName}</span>
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* 行程封面照設定 */}
            <div style={{ marginTop: '0.5rem', borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '1rem' }}>
              <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.5rem', fontWeight: 600 }}>
                🖼️ {t('settings.coverImage')}
              </label>
              
              {/* 目前封面照預覽 */}
              <div style={{
                width: '100%',
                height: '130px',
                borderRadius: '8px',
                backgroundImage: `url(${editForm.coverImage || getCountryCoverImage(countriesList)})`,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
                marginBottom: '0.75rem',
                position: 'relative',
                display: 'flex',
                alignItems: 'flex-end',
                padding: '0.5rem',
                border: '1px solid var(--border-color)',
                boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
              }}>
                <div style={{
                  background: 'rgba(0,0,0,0.6)',
                  color: '#fff',
                  fontSize: '0.7rem',
                  padding: '2px 8px',
                  borderRadius: '4px',
                  backdropFilter: 'blur(4px)'
                }}>
                  {editForm.coverImage ? t('settings.coverImage.custom') : t('settings.coverImage.default')}
                </div>
              </div>

              {/* 圖片上傳與網址輸入 */}
              <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem' }}>
                <input
                  type="text"
                  className="input-field"
                  placeholder={t('settings.coverImage.placeholder')}
                  value={editForm.coverImage.startsWith('data:') ? (locale === 'en' ? '[Local Upload Image (Base64)]' : '已選擇本機上傳圖片 (Base64)') : editForm.coverImage}
                  disabled={editForm.coverImage.startsWith('data:')}
                  onChange={(e) => setEditForm({ ...editForm, coverImage: e.target.value })}
                  style={{ fontSize: '0.8rem', flex: 1 }}
                />
                
                {/* 隱藏的 File Input */}
                <input
                  type="file"
                  id="cover-upload-input"
                  accept="image/*"
                  onChange={handleImageUpload}
                  style={{ display: 'none' }}
                />
                
                <button
                  type="button"
                  onClick={() => document.getElementById('cover-upload-input')?.click()}
                  className="btn-secondary"
                  disabled={uploadingImage}
                  style={{
                    padding: '0.5rem 0.75rem',
                    fontSize: '0.8rem',
                    whiteSpace: 'nowrap',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.25rem',
                    background: 'rgba(255, 255, 255, 0.05)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '8px',
                    color: 'var(--text-primary)',
                    cursor: 'pointer',
                    minHeight: '38px',
                  }}
                >
                  {uploadingImage ? t('settings.coverImage.uploading') : t('settings.coverImage.upload')}
                </button>
              </div>

              {/* 精選預設封面圖列表 */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                  {t('settings.coverImage.orSelect')}
                </div>
                <div style={{
                  display: 'flex',
                  gap: '0.375rem',
                  overflowX: 'auto',
                  paddingBottom: '0.25rem',
                  scrollbarWidth: 'none',
                  WebkitOverflowScrolling: 'touch'
                }}>
                  {/* 清除封面回到預設目的地封面 */}
                  <button
                    type="button"
                    onClick={() => setEditForm({ ...editForm, coverImage: "" })}
                    style={{
                      flexShrink: 0,
                      padding: '0.375rem 0.75rem',
                      borderRadius: '6px',
                      fontSize: '0.7rem',
                      background: !editForm.coverImage ? 'rgba(59, 130, 246, 0.15)' : 'rgba(255,255,255,0.02)',
                      border: !editForm.coverImage ? '1px solid rgba(59, 130, 246, 0.3)' : '1px solid rgba(255,255,255,0.05)',
                      color: !editForm.coverImage ? '#3b82f6' : 'var(--text-secondary)',
                      cursor: 'pointer',
                      transition: 'all 0.15s'
                    }}
                  >
                    🎯 目的地預設
                  </button>

                  {/* 列出一些熱門國家的美圖 */}
                  {[
                    { name: '日本京都', url: 'https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e?w=800&q=80' },
                    { name: '首爾夜景', url: 'https://images.unsplash.com/photo-1534274988757-a28bf1a57c17?w=800&q=80' },
                    { name: '泰國寺廟', url: 'https://images.unsplash.com/photo-1528181304800-259b08848526?w=800&q=80' },
                    { name: '新加坡金沙', url: 'https://images.unsplash.com/photo-1525625293386-3f8f99389edd?w=800&q=80' },
                    { name: '奧地利湖畔', url: 'https://images.unsplash.com/photo-1516550893923-42d28e5677af?w=800&q=80' },
                    { name: '法國巴黎', url: 'https://images.unsplash.com/photo-1502602898657-3e91760cbb34?w=800&q=80' },
                    { name: '義大利威尼斯', url: 'https://images.unsplash.com/photo-1523906834658-6e24ef2386f9?w=800&q=80' },
                    { name: '英國倫敦', url: 'https://images.unsplash.com/photo-1513635269975-59663e0ac1ad?w=800&q=80' },
                    { name: '澳洲雪梨', url: 'https://images.unsplash.com/photo-1506973035872-a4ec16b8e8d9?w=800&q=80' },
                    { name: '紐西蘭湖泊', url: 'https://images.unsplash.com/photo-1469521669194-babb45599def?w=800&q=80' },
                    { name: '美國紐約', url: 'https://images.unsplash.com/photo-1485738422979-f5c462d49f04?w=800&q=80' }
                  ].map(item => {
                    const isSelected = editForm.coverImage === item.url
                    return (
                      <button
                        key={item.name}
                        type="button"
                        onClick={() => setEditForm({ ...editForm, coverImage: item.url })}
                        style={{
                          flexShrink: 0,
                          padding: '0.375rem 0.75rem',
                          borderRadius: '6px',
                          fontSize: '0.7rem',
                          background: isSelected ? 'rgba(59, 130, 246, 0.15)' : 'rgba(255,255,255,0.02)',
                          border: isSelected ? '1px solid rgba(59, 130, 246, 0.3)' : '1px solid rgba(255,255,255,0.05)',
                          color: isSelected ? '#3b82f6' : 'var(--text-secondary)',
                          cursor: 'pointer',
                          transition: 'all 0.15s'
                        }}
                      >
                        {item.name}
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>

            <button onClick={saveSettings} className="btn-primary" disabled={saving}
              style={{ justifyContent: 'center', opacity: saving ? 0.7 : 1 }}>
              {saving ? <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> : t('settings.save')}
            </button>
          </div>
        </div>

        {/* 邀請碼區塊 */}
        <div className="glass-card" style={{ padding: '1.5rem', marginBottom: '1rem' }}>
          <h3 style={{
            fontSize: '0.9rem', fontWeight: 700, marginBottom: '1rem',
            display: 'flex', alignItems: 'center', gap: '0.5rem',
          }}>
            <Share2 size={16} />
            {t('settings.invite')}
          </h3>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
            {t('settings.invite.desc')}
          </p>

          {inviteCode ? (
            <div style={{
              display: 'flex', alignItems: 'center', gap: '0.75rem',
              padding: '1rem',
              borderRadius: 'var(--radius)',
              background: 'rgba(14, 165, 233, 0.08)',
              border: '1px solid rgba(14, 165, 233, 0.2)',
            }}>
              <span style={{
                fontSize: '1.5rem', fontWeight: 800, letterSpacing: '0.15em',
                color: 'var(--color-primary-light)', flex: 1,
                fontFamily: 'monospace',
              }}>
                {inviteCode}
              </span>
              <button onClick={copyCode} className="btn-primary" style={{ padding: '0.5rem 0.75rem' }}>
                {codeCopied ? <><Check size={16} /> {t('settings.invite.copied')}</> : <><Copy size={16} /> {t('settings.invite.copy')}</>}
              </button>
            </div>
          ) : (
            <button onClick={generateInviteCode} className="btn-primary" disabled={generating}>
              {generating ? (
                <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
              ) : (
                <><PlusCircle size={16} /> {t('settings.invite.generate')}</>
              )}
            </button>
          )}
        </div>

        {/* Email 邀請 */}
        <div className="glass-card" style={{ padding: '1.5rem', marginBottom: '1rem' }}>
          <h3 style={{
            fontSize: '0.9rem', fontWeight: 700, marginBottom: '1rem',
            display: 'flex', alignItems: 'center', gap: '0.5rem',
          }}>
            <Mail size={16} />
            {t('settings.emailInvite')}
          </h3>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
            {t('settings.emailInvite.desc')}
          </p>

          <form onSubmit={async (e) => {
            e.preventDefault()
            if (!inviteEmail.trim()) return
            setEmailSending(true)
            setEmailError("")
            setEmailSent(false)
            try {
              const res = await fetch(`/api/trips/${tripId}/invite-email`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: inviteEmail.trim() }),
              })
              const data = await res.json()
              if (res.ok) {
                setEmailSent(true)
                setInviteEmail("")
                setTimeout(() => setEmailSent(false), 4000)
              } else {
                setEmailError(data.error || t('settings.emailInvite.error'))
              }
            } catch {
              setEmailError(t('settings.emailInvite.error'))
            } finally {
              setEmailSending(false)
            }
          }} style={{ display: 'flex', gap: '0.5rem' }}>
            <input
              type="email"
              className="input-field"
              value={inviteEmail}
              onChange={(e) => { setInviteEmail(e.target.value); setEmailError("") }}
              placeholder={t('settings.emailInvite.placeholder')}
              required
              style={{ flex: 1 }}
            />
            <button
              type="submit"
              className="btn-primary"
              disabled={emailSending}
              style={{
                padding: '0.625rem 1rem',
                whiteSpace: 'nowrap',
                opacity: emailSending ? 0.7 : 1,
              }}
            >
              {emailSending ? (
                <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
              ) : (
                <><Send size={16} /> {t('settings.emailInvite.send')}</>
              )}
            </button>
          </form>

          {emailSent && (
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

          {emailError && (
            <div style={{
              marginTop: '0.75rem', padding: '0.625rem 0.875rem',
              borderRadius: 'var(--radius)',
              background: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid rgba(239, 68, 68, 0.2)',
              color: 'var(--color-danger)',
              fontSize: '0.8rem', fontWeight: 500,
            }}>
              {emailError}
            </div>
          )}
        </div>

        {/* 成員管理 */}
        <div className="glass-card" style={{ padding: '1.5rem', marginBottom: '1rem' }}>
          <h3 style={{
            fontSize: '0.9rem', fontWeight: 700, marginBottom: '1rem',
            display: 'flex', alignItems: 'center', gap: '0.5rem',
          }}>
            <Users size={16} />
            {t('settings.members.title')}
          </h3>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {trip.members.map((m) => {
              const isOwner = m.role === 'owner'
              const isRemoving = removingMember === m.id
              return (
                <div
                  key={m.id}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '0.75rem',
                    borderRadius: 'var(--radius)',
                    background: 'var(--bg-secondary)',
                    border: '1px solid var(--border-color)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', minWidth: 0 }}>
                    {m.user.image ? (
                      <img
                        src={m.user.image}
                        alt=""
                        style={{
                          width: 34, height: 34, borderRadius: '50%',
                          objectFit: 'cover', flexShrink: 0,
                        }}
                      />
                    ) : (
                      <div style={{
                        width: 34, height: 34, borderRadius: '50%',
                        background: isOwner ? 'var(--color-primary)' : 'var(--bg-tertiary, #e2e8f0)',
                        color: isOwner ? '#fff' : 'var(--text-muted)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '0.75rem', fontWeight: 700, flexShrink: 0,
                      }}>
                        {(m.user.name || m.user.email || '?')[0].toUpperCase()}
                      </div>
                    )}
                    <div style={{ minWidth: 0 }}>
                      <div style={{
                        fontSize: '0.85rem', fontWeight: 600,
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>
                        {m.user.name || m.user.email}
                      </div>
                      <div style={{
                        fontSize: '0.7rem', color: 'var(--text-muted)',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>
                        {m.user.email}
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
                    {isOwner ? (
                      <span style={{
                        fontSize: '0.7rem', fontWeight: 600,
                        padding: '0.2rem 0.5rem',
                        borderRadius: '6px',
                        background: 'rgba(14, 165, 233, 0.12)',
                        color: 'var(--color-primary)',
                      }}>{t('settings.members.owner')}</span>
                    ) : (
                      <button
                        onClick={() => removeMember(m.id)}
                        disabled={isRemoving}
                        className="btn-danger-sm"
                      >
                        {isRemoving ? (
                          <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} />
                        ) : (
                          <><UserMinus size={13} /> {t('settings.members.remove')}</>
                        )}
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* 危險區域 */}
        <div className="glass-card" style={{
          padding: '1.5rem',
          border: '1px solid rgba(239, 68, 68, 0.2)',
        }}>
          <h3 style={{
            fontSize: '0.9rem', fontWeight: 700, marginBottom: '0.5rem',
            display: 'flex', alignItems: 'center', gap: '0.5rem',
            color: 'var(--color-danger)',
          }}>
            <AlertTriangle size={16} />
            {t('settings.danger')}
          </h3>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
            {t('settings.danger.desc')}
          </p>

          {showDeleteConfirm ? (
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button onClick={deleteTrip} className="btn-danger" disabled={deleting}
                style={{ flex: 1, justifyContent: 'center' }}>
                {deleting ? <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> : t('settings.delete.confirm')}
              </button>
              <button onClick={() => setShowDeleteConfirm(false)} className="btn-secondary"
                style={{ flex: 1, justifyContent: 'center' }}>
                {t('settings.delete.cancel')}
              </button>
            </div>
          ) : (
            <button onClick={() => setShowDeleteConfirm(true)} className="btn-danger">
              <Trash2 size={16} />
              {t('settings.delete')}
            </button>
          )}
        </div>
      </main>
    </div>
  )
}
