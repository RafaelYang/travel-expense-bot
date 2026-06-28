/**
 * 行程設定頁 — 邀請碼管理、狀態切換、成員管理
 */
"use client"

import { useEffect, useState, use } from "react"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import { Navbar } from "@/components/navbar"
import {
  ArrowLeft, Copy, Check, PlusCircle, Trash2,
  Loader2, Settings, Users, Share2, AlertTriangle, Mail, Send,
  UserMinus,
} from "lucide-react"
import Link from "next/link"
import { TRIP_STATUS, CURRENCIES } from "@/lib/utils"
import { useLanguage } from "@/components/language-provider"

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
  const { data: session } = useSession()
  const router = useRouter()
  const [trip, setTrip] = useState<TripSettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [inviteCode, setInviteCode] = useState("")
  const [codeCopied, setCodeCopied] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [inviteEmail, setInviteEmail] = useState("")
  const [emailSending, setEmailSending] = useState(false)
  const [emailSent, setEmailSent] = useState(false)
  const [emailError, setEmailError] = useState("")
  const [removingMember, setRemovingMember] = useState<string | null>(null)
  const [lineCode, setLineCode] = useState("")
  const [lineCodeExpires, setLineCodeExpires] = useState<string | null>(null)
  const [generatingLineCode, setGeneratingLineCode] = useState(false)
  const [lineCodeCopied, setLineCodeCopied] = useState(false)
  const [hasLinkedLine, setHasLinkedLine] = useState(false)
  const [isLineActive, setIsLineActive] = useState(false)
  const [lineDayText, setLineDayText] = useState("")
  const [settingDefault, setSettingDefault] = useState(false)
  const [lineCurrency, setLineCurrency] = useState<string | null>(null)
  const { t } = useLanguage()

  const [countriesList, setCountriesList] = useState<string[]>([])
  const [dailyCountries, setDailyCountries] = useState<string[]>([])

  const COUNTRY_INFO_MAP: Record<string, { flag: string; name: string }> = {
    TW: { flag: "🇹🇼", name: "台灣" },
    JP: { flag: "🇯🇵", name: "日本" },
    KR: { flag: "🇰🇷", name: "韓國" },
    AT: { flag: "🇦🇹", name: "奧地利" },
    DE: { flag: "🇩🇪", name: "德國" },
    FR: { flag: "🇫🇷", name: "法國" },
    IT: { flag: "🇮🇹", name: "義大利" },
    ES: { flag: "🇪🇸", name: "西班牙" },
    NL: { flag: "🇳🇱", name: "荷蘭" },
    PT: { flag: "🇵🇹", name: "葡萄牙" },
    GR: { flag: "🇬🇷", name: "希臘" },
    FI: { flag: "🇫🇮", name: "芬蘭" },
    CZ: { flag: "🇨🇿", name: "捷克" },
    HU: { flag: "🇭🇺", name: "匈牙利" },
    PL: { flag: "🇵🇱", name: "波蘭" },
    CH: { flag: "🇨🇭", name: "瑞士" },
    GB: { flag: "🇬🇧", name: "英國" },
    SE: { flag: "🇸🇪", name: "瑞典" },
    NO: { flag: "🇳🇴", name: "挪威" },
    DK: { flag: "🇩🇰", name: "丹麥" },
    IS: { flag: "🇮🇸", name: "冰島" },
    HR: { flag: "🇭🇷", name: "克羅埃西亞" },
    TR: { flag: "🇹🇷", name: "土耳其" },
    CN: { flag: "🇨🇳", name: "中國" },
    HK: { flag: "🇭🇰", name: "香港" },
    MO: { flag: "🇲🇴", name: "澳門" },
    TH: { flag: "🇹🇭", name: "泰國" },
    VN: { flag: "🇻🇳", name: "越南" },
    SG: { flag: "🇸🇬", name: "新加坡" },
    MY: { flag: "🇲🇾", name: "馬來西亞" },
    PH: { flag: "🇵🇭", name: "菲律賓" },
    ID: { flag: "🇮🇩", name: "印尼" },
    AU: { flag: "🇦🇺", name: "澳洲" },
    NZ: { flag: "🇳🇿", name: "紐西蘭" },
    CA: { flag: "🇨🇦", name: "加拿大" },
  }

  const COUNTRY_CURRENCY_MAP: Record<string, { code: string; name: string }> = {
    TW: { code: "TWD", name: "台幣" },
    JP: { code: "JPY", name: "日圓" },
    US: { code: "USD", name: "美金" },
    AT: { code: "EUR", name: "歐元" },
    DE: { code: "EUR", name: "歐元" },
    FR: { code: "EUR", name: "歐元" },
    IT: { code: "EUR", name: "歐元" },
    ES: { code: "EUR", name: "歐元" },
    NL: { code: "EUR", name: "歐元" },
    PT: { code: "EUR", name: "歐元" },
    GR: { code: "EUR", name: "歐元" },
    FI: { code: "EUR", name: "歐元" },
    CZ: { code: "CZK", name: "克朗" },
    HU: { code: "HUF", name: "福林" },
    PL: { code: "PLN", name: "茲羅提" },
    CH: { code: "CHF", name: "法郎" },
    GB: { code: "GBP", name: "英鎊" },
    SE: { code: "SEK", name: "克朗" },
    NO: { code: "NOK", name: "克朗" },
    DK: { code: "DKK", name: "克朗" },
    IS: { code: "ISK", name: "克朗" },
    HR: { code: "EUR", name: "歐元" },
    TR: { code: "TRY", name: "里拉" },
    KR: { code: "KRW", name: "韓元" },
    CN: { code: "CNY", name: "人民幣" },
    HK: { code: "HKD", name: "港幣" },
    MO: { code: "MOP", name: "澳門幣" },
    TH: { code: "THB", name: "泰銖" },
    VN: { code: "VND", name: "越南盾" },
    SG: { code: "SGD", name: "新幣" },
    MY: { code: "MYR", name: "馬幣" },
    PH: { code: "PHP", name: "披索" },
    ID: { code: "IDR", name: "印尼盾" },
    AU: { code: "AUD", name: "澳幣" },
    NZ: { code: "NZD", name: "紐幣" },
    CA: { code: "CAD", name: "加幣" },
  }

  const getTripCurrencies = () => {
    const list: { code: string; name: string }[] = []
    if (trip && trip.countries && Array.isArray(trip.countries)) {
      trip.countries.forEach((c: string) => {
        const match = COUNTRY_CURRENCY_MAP[c.toUpperCase()]
        if (match) list.push(match)
      })
    }
    const common = [
      { code: "TWD", name: "台幣" },
      { code: "JPY", name: "日圓" },
      { code: "USD", name: "美金" },
      { code: "EUR", name: "歐元" },
    ]
    common.forEach(item => list.push(item))
    const result: { code: string; name: string }[] = []
    const seen = new Set<string>()
    list.forEach(item => {
      if (!seen.has(item.code)) {
        seen.add(item.code)
        result.push(item)
      }
    })
    return result
  }

  const updateLineCurrency = async (currencyCode: string) => {
    try {
      const res = await fetch(`/api/trips/${tripId}/line-link`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ currency: currencyCode }),
      })
      if (res.ok) {
        setLineCurrency(currencyCode)
      } else {
        const data = await res.json()
        alert(data.error || "更新失敗")
      }
    } catch {
      alert("更新失敗")
    }
  }

  const [editForm, setEditForm] = useState({
    name: "",
    description: "",
    startDate: "",
    endDate: "",
    baseCurrency: "",
  })

  useEffect(() => {
    fetchTrip()
    fetchLineLinkStatus()
  }, [tripId])

  // 自動根據 startDate / endDate 天數增減來補齊/裁切每日國家分配陣列
  useEffect(() => {
    if (!editForm.startDate || !editForm.endDate) return
    const start = new Date(editForm.startDate)
    const end = new Date(editForm.endDate)
    if (isNaN(start.getTime()) || isNaN(end.getTime())) return

    const totalDays = Math.ceil((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)) + 1
    if (totalDays <= 0) return

    setDailyCountries((prev) => {
      const next = [...prev]
      if (next.length < totalDays) {
        const fallback = countriesList[0] || "TW"
        const lastVal = next[next.length - 1] || fallback
        while (next.length < totalDays) {
          next.push(lastVal)
        }
      } else if (next.length > totalDays) {
        return next.slice(0, totalDays)
      }
      return next
    })
  }, [editForm.startDate, editForm.endDate, countriesList])

  const fetchTrip = async () => {
    try {
      const res = await fetch(`/api/trips/${tripId}`)
      if (!res.ok) { router.push("/"); return }
      const data = await res.json()
      setTrip(data)
      setEditForm({
        name: data.name,
        description: data.description || "",
        startDate: data.startDate.split("T")[0],
        endDate: data.endDate.split("T")[0],
        baseCurrency: data.baseCurrency,
      })

      // 解析目的地國家 JSON
      try {
        const parsed = JSON.parse(data.countries || "[]")
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          setCountriesList(parsed.list || [])
          setDailyCountries(parsed.daily || [])
        } else if (Array.isArray(parsed)) {
          setCountriesList(parsed)
          // 均分配套
          const start = new Date(data.startDate)
          const end = new Date(data.endDate)
          const totalDays = Math.ceil((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)) + 1
          const daily: string[] = []
          for (let i = 0; i < totalDays; i++) {
            if (parsed.length === 1) {
              daily.push(parsed[0])
            } else if (parsed.length > 1) {
              const interval = totalDays / parsed.length
              const countryIdx = Math.min(Math.floor(i / interval), parsed.length - 1)
              daily.push(parsed[countryIdx])
            } else {
              daily.push("TW")
            }
          }
          setDailyCountries(daily)
        }
      } catch (e) {
        setCountriesList([])
        setDailyCountries([])
      }
    } catch {
      router.push("/")
    } finally {
      setLoading(false)
    }
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

  const saveSettings = async () => {
    setSaving(true)
    try {
      const payload = {
        ...editForm,
        countries: JSON.stringify({
          list: countriesList,
          daily: dailyCountries,
        })
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
      router.push("/")
    } finally {
      setDeleting(false)
    }
  }

  const removeMember = async (memberId: string) => {
    if (!confirm('確定要移除這位成員嗎？')) return
    setRemovingMember(memberId)
    try {
      const res = await fetch(`/api/trips/${tripId}/members/${memberId}`, {
        method: 'DELETE',
      })
      if (res.ok) {
        fetchTrip()
      } else {
        const data = await res.json()
        alert(data.error || '移除失敗')
      }
    } catch {
      alert('移除失敗')
    } finally {
      setRemovingMember(null)
    }
  }

  const fetchLineLinkStatus = async () => {
    try {
      const res = await fetch(`/api/trips/${tripId}/line-link`)
      if (res.ok) {
        const data = await res.json()
        setHasLinkedLine(data.hasLinkedLine)
        setIsLineActive(data.isActive)
        setLineDayText(data.dayText)
      }
    } catch (err) {
      console.error("載入 LINE 連動狀態失敗", err)
    }
  }

  const generateLineCode = async () => {
    setGeneratingLineCode(true)
    try {
      // 產生個人帳號連動碼
      const res = await fetch(`/api/users/line-link`, { method: "POST" })
      const data = await res.json()
      if (res.ok) {
        setLineCode(data.token)
        setLineCodeExpires(data.expires)
      } else {
        alert(data.error || "產生連動碼失敗")
      }
    } catch {
      alert("產生連動碼失敗")
    } finally {
      setGeneratingLineCode(false)
    }
  }

  const copyLineCommand = () => {
    navigator.clipboard.writeText(`/link ${lineCode}`)
    setLineCodeCopied(true)
    setTimeout(() => setLineCodeCopied(false), 2000)
  }

  const setAsDefaultTrip = async () => {
    setSettingDefault(true)
    try {
      const res = await fetch(`/api/trips/${tripId}/line-link`, { method: "PUT" })
      if (res.ok) {
        fetchLineLinkStatus()
        alert(t('settings.lineLink.setAsDefault.success') || "設定成功！")
      } else {
        const data = await res.json()
        alert(data.error || "設定失敗")
      }
    } catch {
      alert("設定失敗")
    } finally {
      setSettingDefault(false)
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

        {/* LINE 快速記帳與連動 */}
        <div className="glass-card" style={{ padding: '1.5rem', marginBottom: '1rem' }}>
          <h3 style={{
            fontSize: '0.9rem', fontWeight: 700, marginBottom: '1rem',
            display: 'flex', alignItems: 'center', gap: '0.5rem',
          }}>
            <span style={{ fontSize: '1.1rem' }}>💬</span>
            {t('settings.lineLink')}
          </h3>
          
          {!hasLinkedLine ? (
            <div>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.75rem', lineHeight: 1.5 }}>
                {t('settings.lineLink.desc')}
              </p>
              <div style={{
                fontSize: '0.8rem', padding: '0.75rem', borderRadius: 'var(--radius)',
                background: 'rgba(245, 158, 11, 0.08)', border: '1px solid rgba(245, 158, 11, 0.2)',
                color: '#f59e0b', fontWeight: 500, lineHeight: 1.6
              }}>
                💡 您的帳號尚未連結 LINE 帳號。<br />
                請點擊右上角**個人頭像選單**，選擇 **「連結 LINE 帳號」** 並依指示完成個人綁定。綁定後即可於此處將本行程設為 LINE 預設記帳行程！
              </div>
            </div>
          ) : (
            <div>
              <h4 style={{
                fontSize: '0.85rem', fontWeight: 700, marginBottom: '0.75rem',
                display: 'flex', alignItems: 'center', gap: '0.375rem'
              }}>
                {t('settings.lineLink.status.title')}
              </h4>

              {isLineActive ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <div style={{
                    fontSize: '0.8rem', padding: '0.75rem', borderRadius: 'var(--radius)',
                    background: 'rgba(14, 165, 233, 0.08)', border: '1px solid rgba(14, 165, 233, 0.2)',
                    color: 'var(--color-primary-light)', fontWeight: 500
                  }}>
                    {t('settings.lineLink.status.active')}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginLeft: '0.25rem' }}>
                    {t('settings.lineLink.status.activeDay').replace('{dayText}', lineDayText)}
                  </div>

                  {/* 網頁端快速設定與預設幣值顯示 */}
                  <div style={{ 
                    marginTop: '0.75rem', 
                    borderTop: '1px solid rgba(255,255,255,0.08)', 
                    paddingTop: '0.75rem' 
                  }}>
                    <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.5rem', fontWeight: 500 }}>
                      💱 LINE 預設記帳幣別：<span style={{ color: 'var(--color-primary-light)', fontWeight: 700 }}>{lineCurrency || "TWD"}</span>
                    </label>
                    <div style={{ display: 'flex', gap: '0.375rem', flexWrap: 'wrap' }}>
                      {getTripCurrencies().map((cur) => {
                        const isActiveCur = lineCurrency === cur.code
                        return (
                          <button
                            key={cur.code}
                            onClick={() => updateLineCurrency(cur.code)}
                            style={{ 
                              fontSize: '0.7rem', 
                              padding: '0.25rem 0.5rem', 
                              borderRadius: '20px', 
                              minHeight: 'auto',
                              background: isActiveCur ? 'var(--color-primary)' : 'rgba(255,255,255,0.05)',
                              border: isActiveCur ? 'none' : '1px solid rgba(255,255,255,0.1)',
                              color: isActiveCur ? '#fff' : 'var(--text-secondary)',
                              cursor: 'pointer',
                              transition: 'all 0.2s',
                              fontWeight: isActiveCur ? 600 : 400
                            }}
                          >
                            {cur.name} ({cur.code})
                          </button>
                        )
                      })}
                    </div>
                    <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.5rem', lineHeight: 1.4 }}>
                      💡 提示：您也可以在 LINE 傳送 <code>/currency [幣別]</code> 或直接點選聊天室鍵盤上方的快速按鈕隨時進行切換唷！
                    </p>
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  <div style={{
                    fontSize: '0.8rem', padding: '0.75rem', borderRadius: 'var(--radius)',
                    background: 'rgba(245, 158, 11, 0.08)', border: '1px solid rgba(245, 158, 11, 0.2)',
                    color: '#f59e0b', fontWeight: 500
                  }}>
                    {t('settings.lineLink.status.inactive')}
                  </div>
                  <button onClick={setAsDefaultTrip} className="btn-primary" disabled={settingDefault} style={{ justifyContent: 'center' }}>
                    {settingDefault ? (
                      <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
                    ) : (
                      t('settings.lineLink.setAsDefault')
                    )}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

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
                <input type="date" className="input-field date-input" value={editForm.startDate}
                  onChange={(e) => setEditForm({ ...editForm, startDate: e.target.value })} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.375rem', fontWeight: 500 }}>
                  {t('settings.endDate')}
                </label>
                <input type="date" className="input-field date-input" value={editForm.endDate}
                  onChange={(e) => setEditForm({ ...editForm, endDate: e.target.value })} />
              </div>
            </div>

            {/* 每日目的地設定 */}
            {dailyCountries.length > 0 && (
              <div style={{ marginTop: '0.5rem', borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '1rem' }}>
                <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.5rem', fontWeight: 600 }}>
                  🗺️ 每日目的地國家設定 (LINE 機器人風景圖與時區依據)
                </label>
                <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '0.75rem', lineHeight: 1.4 }}>
                  如果您的行程橫跨多個國家，可以在此為每一天設定主要的國家。機器人會以此為依據來套用該國時區，並自動配置當天的精美風景底圖唷！
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
                            const info = COUNTRY_INFO_MAP[c.toUpperCase()] || { flag: "🌐", name: c }
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
                                <span>{info.flag}</span>
                                <span>{info.name}</span>
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

            <button onClick={saveSettings} className="btn-primary" disabled={saving}
              style={{ justifyContent: 'center', opacity: saving ? 0.7 : 1 }}>
              {saving ? <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> : t('settings.save')}
            </button>
          </div>
        </div>

        {/* 成員管理 */}
        <div className="glass-card" style={{ padding: '1.5rem', marginBottom: '1rem' }}>
          <h3 style={{
            fontSize: '0.9rem', fontWeight: 700, marginBottom: '1rem',
            display: 'flex', alignItems: 'center', gap: '0.5rem',
          }}>
            <Users size={16} />
            成員管理
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
                      }}>擁有者</span>
                    ) : (
                      <button
                        onClick={() => removeMember(m.id)}
                        disabled={isRemoving}
                        className="btn-danger-sm"
                      >
                        {isRemoving ? (
                          <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} />
                        ) : (
                          <><UserMinus size={13} /> 移除</>
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
