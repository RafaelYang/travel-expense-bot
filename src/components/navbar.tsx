/**
 * 導覽列元件 — 桌面版頂部 + 手機版底部 Tab Bar
 * - 飛機剪影 Logo + 品牌名稱
 * - 頭像下拉選單：主題（hover 子選單）、語言、登出
 */
"use client"

import Link from "next/link"
import Image from "next/image"
import { useSession, signOut } from "next-auth/react"
import { LogOut, Menu, X, ChevronDown, ChevronRight, Sun, Moon, Monitor, Globe, Coins, MessageSquare, Loader2 } from "lucide-react"
import { useState, useRef, useEffect, useSyncExternalStore } from "react"
import { useTheme } from "./theme-provider"
import { useLanguage } from "./language-provider"
import { ALL_CURRENCIES } from "@/lib/countries"

/** 飛機剪影 SVG */
function PlaneIcon({ size = 20, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M21 16v-2l-8-5V3.5A1.5 1.5 0 0 0 11.5 2 1.5 1.5 0 0 0 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z" />
    </svg>
  )
}

const CURRENCY_CHANGE_EVENT = "travel-expense-currency-change"
const LINE_STATUS_CACHE_MS = 60_000

interface LineStatus {
  hasLinkedLine: boolean
  activeTripName: string | null
}

let lineStatusCache: { userId: string; data: LineStatus; expiresAt: number } | null = null
let lineStatusRequest: { userId: string; promise: Promise<LineStatus | null> } | null = null

async function getLineStatus(userId: string): Promise<LineStatus | null> {
  if (lineStatusCache?.userId === userId && lineStatusCache.expiresAt > Date.now()) {
    return lineStatusCache.data
  }

  if (lineStatusRequest?.userId === userId) {
    return lineStatusRequest.promise
  }

  const promise = fetch('/api/users/line-link')
    .then(async (res) => res.ok ? res.json() as Promise<LineStatus> : null)
    .then((data) => {
      if (data) {
        lineStatusCache = {
          userId,
          data,
          expiresAt: Date.now() + LINE_STATUS_CACHE_MS,
        }
      }
      return data
    })
    .finally(() => {
      if (lineStatusRequest?.userId === userId) {
        lineStatusRequest = null
      }
    })

  lineStatusRequest = { userId, promise }
  return promise
}

function getPreferredCurrencySnapshot() {
  const saved = localStorage.getItem("preferredCurrency")
  return saved && ALL_CURRENCIES[saved] ? saved : "TWD"
}

function subscribePreferredCurrency(onStoreChange: () => void) {
  window.addEventListener("storage", onStoreChange)
  window.addEventListener(CURRENCY_CHANGE_EVENT, onStoreChange)
  return () => {
    window.removeEventListener("storage", onStoreChange)
    window.removeEventListener(CURRENCY_CHANGE_EVENT, onStoreChange)
  }
}

export function Navbar() {
  const { data: session } = useSession()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const [themeSubOpen, setThemeSubOpen] = useState(false)
  const [langSubOpen, setLangSubOpen] = useState(false)
  const [currencySubOpen, setCurrencySubOpen] = useState(false)
  const userMenuRef = useRef<HTMLDivElement>(null)
  const { theme, setTheme } = useTheme()
  const { locale, setLocale, t } = useLanguage()

  // LINE 連動狀態
  const [lineLinked, setLineLinked] = useState(false)
  const [activeTripName, setActiveTripName] = useState<string | null>(null)
  const [lineModalOpen, setLineModalOpen] = useState(false)
  const [lineCode, setLineCode] = useState("")
  const [generatingLineCode, setGeneratingLineCode] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    const userId = session?.user?.id
    if (!userId) return

    let cancelled = false
    getLineStatus(userId)
      .then((data) => {
        if (!data || cancelled) return
        setLineLinked(data.hasLinkedLine)
        setActiveTripName(data.activeTripName)
      })
      .catch((error) => {
        console.error("載入 LINE 狀態失敗", error)
      })

    return () => { cancelled = true }
  }, [session?.user?.id])

  const generateLineCode = async () => {
    setGeneratingLineCode(true)
    try {
      const res = await fetch("/api/users/line-link", { method: "POST" })
      const data = await res.json()
      if (res.ok) {
        setLineCode(data.token)
      } else {
        alert(data.error || "產生連動碼失敗")
      }
    } catch {
      alert("產生連動碼失敗")
    } finally {
      setGeneratingLineCode(false)
    }
  }

  const copyCommand = () => {
    navigator.clipboard.writeText(`/link ${lineCode}`)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // 偏好幣種（存 localStorage）
  const preferredCurrency = useSyncExternalStore(
    subscribePreferredCurrency,
    getPreferredCurrencySnapshot,
    () => "TWD",
  )
  const setPreferredCurrency = (cur: string) => {
    localStorage.setItem('preferredCurrency', cur)
    window.dispatchEvent(new Event(CURRENCY_CHANGE_EVENT))
  }

  // 常用幣種（在選單裡顯示的）
  const quickCurrencies = ['TWD', 'JPY', 'USD', 'EUR', 'KRW', 'THB', 'GBP', 'CNY', 'HKD', 'AUD']

  const themeOptions = [
    { value: 'light' as const, label: t('menu.theme.light'), icon: Sun },
    { value: 'dark' as const, label: t('menu.theme.dark'), icon: Moon },
    { value: 'system' as const, label: t('menu.theme.system'), icon: Monitor },
  ]

  const langOptions = [
    { value: 'zh-TW' as const, label: '繁體中文', flag: '🇹🇼' },
    { value: 'en' as const, label: 'English', flag: '🇺🇸' },
  ]

  // 點擊外部關閉
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setUserMenuOpen(false)
        setThemeSubOpen(false)
        setLangSubOpen(false)
        setCurrencySubOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  if (!session) return null



  const displayName = session.user?.name || session.user?.email?.split('@')[0] || t('menu.user.fallback')
  const userImage = session.user?.image
  const userEmail = session.user?.email
  const avatarFallback = displayName.charAt(0).toUpperCase()

  // 共用的子選單 item 樣式
  const subItemStyle = (isSelected: boolean) => ({
    width: '100%' as const,
    display: 'flex' as const,
    alignItems: 'center' as const,
    gap: '0.5rem',
    padding: '0.5rem 0.75rem',
    borderRadius: '6px',
    border: 'none' as const,
    fontSize: '0.8rem',
    cursor: 'pointer' as const,
    transition: 'background 0.15s ease',
    background: isSelected ? 'var(--color-primary)' : 'transparent',
    color: isSelected ? '#fff' : 'var(--text-secondary)',
    fontWeight: isSelected ? 600 : 400,
    textAlign: 'left' as const,
  })

  /** 桌面版下拉選單 */
  const renderDesktopDropdown = () => (
    <div style={{
      position: 'absolute',
      top: 'calc(100% + 8px)',
      right: 0,
      width: '220px',
      background: 'var(--dropdown-bg)',
      backdropFilter: 'blur(20px)',
      WebkitBackdropFilter: 'blur(20px)',
      border: '1px solid var(--border-color)',
      borderRadius: '12px',
      boxShadow: '0 10px 40px rgba(0,0,0,0.12), 0 0 0 1px var(--glass-border)',
      overflow: 'visible',
      animation: 'fadeInDown 0.15s ease-out',
    }}>
      {/* 使用者資訊 */}
      <div style={{
        padding: '0.875rem',
        borderBottom: '1px solid var(--border-color)',
        display: 'flex',
        alignItems: 'center',
        gap: '0.625rem',
      }}>
        {userImage ? (
          <Image src={userImage} alt={displayName} width={36} height={36} style={{
            borderRadius: '50%', objectFit: 'cover',
            border: '2px solid rgba(14, 165, 233, 0.3)', flexShrink: 0,
          }} />
        ) : (
          <div style={{
            width: '36px', height: '36px', borderRadius: '50%',
            background: 'linear-gradient(135deg, var(--color-primary), #7c3aed)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '0.875rem', fontWeight: 700, color: '#fff', flexShrink: 0,
          }}>{avatarFallback}</div>
        )}
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {displayName}
          </div>
          {userEmail && (
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {userEmail}
            </div>
          )}
        </div>
      </div>

      {/* 選單項目 */}
      <div style={{ padding: '0.375rem' }}>
        {/* 主題 — hover 展開子選單 */}
        <div
          style={{ position: 'relative' }}
          onMouseEnter={() => { setThemeSubOpen(true); setLangSubOpen(false) }}
          onMouseLeave={() => setThemeSubOpen(false)}
        >
          <button style={{
            width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            gap: '0.5rem', padding: '0.5rem 0.625rem', borderRadius: '8px',
            background: themeSubOpen ? 'var(--bg-card-hover)' : 'transparent',
            border: 'none', color: 'var(--text-primary)', fontSize: '0.85rem',
            cursor: 'pointer', transition: 'background 0.15s ease',
          }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Sun size={15} /> {t('menu.theme')}
            </span>
            <ChevronRight size={13} style={{ color: 'var(--text-muted)' }} />
          </button>

          {/* 主題子選單 — 用橋接容器消除間隙 */}
          {themeSubOpen && (
            <div style={{
              position: 'absolute', left: '100%', top: '-8px', bottom: '-8px',
              paddingLeft: '6px',
            }}>
              <div style={{
                width: '140px', background: 'var(--dropdown-bg)',
                backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
                border: '1px solid var(--border-color)', borderRadius: '10px',
                boxShadow: '0 8px 30px rgba(0,0,0,0.1)',
                padding: '0.375rem', animation: 'fadeInDown 0.1s ease-out',
              }}>
                {themeOptions.map(opt => (
                  <button key={opt.value} onClick={() => { setTheme(opt.value); setThemeSubOpen(false) }}
                    style={subItemStyle(theme === opt.value)}
                    onMouseEnter={(e) => { if (theme !== opt.value) e.currentTarget.style.background = 'var(--bg-card-hover)' }}
                    onMouseLeave={(e) => { if (theme !== opt.value) e.currentTarget.style.background = 'transparent' }}
                  >
                    <opt.icon size={14} /> {opt.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* 語言 — hover 展開子選單 */}
        <div
          style={{ position: 'relative' }}
          onMouseEnter={() => { setLangSubOpen(true); setThemeSubOpen(false) }}
          onMouseLeave={() => setLangSubOpen(false)}
        >
          <button style={{
            width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            gap: '0.5rem', padding: '0.5rem 0.625rem', borderRadius: '8px',
            background: langSubOpen ? 'var(--bg-card-hover)' : 'transparent',
            border: 'none', color: 'var(--text-primary)', fontSize: '0.85rem',
            cursor: 'pointer', transition: 'background 0.15s ease',
          }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Globe size={15} /> {t('menu.language')}
            </span>
            <ChevronRight size={13} style={{ color: 'var(--text-muted)' }} />
          </button>

          {/* 語言子選單 — 用橋接容器消除間隙 */}
          {langSubOpen && (
            <div style={{
              position: 'absolute', left: '100%', top: '-8px', bottom: '-8px',
              paddingLeft: '6px',
            }}>
              <div style={{
                width: '150px', background: 'var(--dropdown-bg)',
                backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
                border: '1px solid var(--border-color)', borderRadius: '10px',
                boxShadow: '0 8px 30px rgba(0,0,0,0.1)',
                padding: '0.375rem', animation: 'fadeInDown 0.1s ease-out',
              }}>
                {langOptions.map(opt => (
                  <button key={opt.value} onClick={() => { setLocale(opt.value); setLangSubOpen(false) }}
                    style={subItemStyle(locale === opt.value)}
                    onMouseEnter={(e) => { if (locale !== opt.value) e.currentTarget.style.background = 'var(--bg-card-hover)' }}
                    onMouseLeave={(e) => { if (locale !== opt.value) e.currentTarget.style.background = 'transparent' }}
                  >
                    <span>{opt.flag}</span> {opt.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* 偏好幣種 — hover 展開子選單 */}
        <div
          style={{ position: 'relative' }}
          onMouseEnter={() => { setCurrencySubOpen(true); setThemeSubOpen(false); setLangSubOpen(false) }}
          onMouseLeave={() => setCurrencySubOpen(false)}
        >
          <button style={{
            width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            gap: '0.5rem', padding: '0.5rem 0.625rem', borderRadius: '8px',
            background: currencySubOpen ? 'var(--bg-card-hover)' : 'transparent',
            border: 'none', color: 'var(--text-primary)', fontSize: '0.85rem',
            cursor: 'pointer', transition: 'background 0.15s ease',
          }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Coins size={15} /> {t('menu.currency')}
              <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 400 }}>
                {ALL_CURRENCIES[preferredCurrency]?.nameCn || preferredCurrency}
              </span>
            </span>
            <ChevronRight size={13} style={{ color: 'var(--text-muted)' }} />
          </button>

          {currencySubOpen && (
            <div style={{
              position: 'absolute', left: '100%', top: '-8px', bottom: '-8px',
              paddingLeft: '6px',
            }}>
              <div style={{
                width: '160px', background: 'var(--dropdown-bg)',
                backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
                border: '1px solid var(--border-color)', borderRadius: '10px',
                boxShadow: '0 8px 30px rgba(0,0,0,0.1)',
                padding: '0.375rem', animation: 'fadeInDown 0.1s ease-out',
                maxHeight: '280px', overflowY: 'auto',
              }}>
                {quickCurrencies.map(cur => (
                  <button key={cur} onClick={() => { setPreferredCurrency(cur); setCurrencySubOpen(false) }}
                    style={subItemStyle(preferredCurrency === cur)}
                    onMouseEnter={(e) => { if (preferredCurrency !== cur) e.currentTarget.style.background = 'var(--bg-card-hover)' }}
                    onMouseLeave={(e) => { if (preferredCurrency !== cur) e.currentTarget.style.background = 'transparent' }}
                  >
                    {ALL_CURRENCIES[cur]?.symbol} {ALL_CURRENCIES[cur]?.nameCn || cur}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* LINE 記帳連動 */}
        <button
          onClick={() => { setUserMenuOpen(false); setLineModalOpen(true) }}
          style={{
            width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            gap: '0.5rem', padding: '0.5rem 0.625rem', borderRadius: '8px',
            background: 'transparent', border: 'none', color: 'var(--text-primary)', fontSize: '0.85rem',
            cursor: 'pointer', transition: 'background 0.15s ease',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-card-hover)' }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: 0 }}>
            <MessageSquare size={15} style={{ color: lineLinked ? '#06c755' : 'var(--text-secondary)' }} />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {lineLinked ? t('menu.lineLink.linked') : t('menu.lineLink.notLinked')}
            </span>
          </span>
          {lineLinked && activeTripName && (
            <span style={{
              fontSize: '0.65rem', color: 'var(--text-muted)',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              maxWidth: '80px', textAlign: 'right'
            }}>
              {activeTripName}
            </span>
          )}
        </button>
      </div>

      {/* 登出 */}
      <div style={{ padding: '0.375rem', borderTop: '1px solid var(--border-color)' }}>
        <button
          onClick={() => { setUserMenuOpen(false); signOut({ callbackUrl: '/login' }) }}
          id="logout-button"
          style={{
            width: '100%', display: 'flex', alignItems: 'center', gap: '0.5rem',
            padding: '0.5rem 0.625rem', borderRadius: '8px',
            background: 'transparent', border: 'none', color: '#f87171',
            fontSize: '0.85rem', cursor: 'pointer', transition: 'background 0.15s ease',
            textAlign: 'left',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(248, 113, 113, 0.1)' }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
        >
          <LogOut size={15} /> {t('menu.logout')}
        </button>
      </div>
    </div>
  )

  return (
    <>
      {/* === 桌面版導覽列 === */}
      <nav className="hide-mobile" style={{
        position: 'sticky', top: 0, zIndex: 50,
        background: 'var(--nav-bg)',
        backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
        borderBottom: '1px solid var(--border-color)',
      }}>
        <div style={{
          maxWidth: '1200px', margin: '0 auto', padding: '0 1.5rem',
          height: '64px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          {/* Logo */}
          <Link href="/" style={{
            display: 'flex', alignItems: 'center', gap: '0.5rem',
            textDecoration: 'none', color: 'var(--text-primary)',
          }}>
            <PlaneIcon size={22} />
            <span style={{ fontSize: '1.05rem', fontWeight: 700, letterSpacing: '-0.02em' }}>
              {t('brand.name')}
            </span>
          </Link>



          {/* 使用者頭像 + 下拉選單 */}
          <div ref={userMenuRef} style={{ position: 'relative' }}>
            <button
              onClick={() => { setUserMenuOpen(!userMenuOpen); setThemeSubOpen(false); setLangSubOpen(false) }}
              id="user-menu-button"
              style={{
                display: 'flex', alignItems: 'center', gap: '0.5rem',
                padding: '0.375rem 0.625rem 0.375rem 0.375rem',
                borderRadius: '9999px',
                background: userMenuOpen ? 'rgba(14, 165, 233, 0.15)' : 'rgba(14, 165, 233, 0.08)',
                border: `1px solid ${userMenuOpen ? 'rgba(14, 165, 233, 0.3)' : 'transparent'}`,
                cursor: 'pointer', color: 'var(--text-primary)', transition: 'all 0.2s ease',
              }}
              onMouseEnter={(e) => { if (!userMenuOpen) e.currentTarget.style.background = 'rgba(14, 165, 233, 0.12)' }}
              onMouseLeave={(e) => { if (!userMenuOpen) e.currentTarget.style.background = 'rgba(14, 165, 233, 0.08)' }}
            >
              {userImage ? (
                <Image src={userImage} alt={displayName} width={30} height={30} style={{
                  borderRadius: '50%', objectFit: 'cover', border: '2px solid rgba(14, 165, 233, 0.3)',
                }} />
              ) : (
                <div style={{
                  width: '30px', height: '30px', borderRadius: '50%',
                  background: 'linear-gradient(135deg, var(--color-primary), #7c3aed)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '0.8rem', fontWeight: 700, color: '#fff',
                  border: '2px solid rgba(14, 165, 233, 0.3)',
                }}>{avatarFallback}</div>
              )}
              <span style={{ fontSize: '0.85rem', fontWeight: 500, maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {displayName}
              </span>
              <ChevronDown size={14} style={{
                color: 'var(--text-muted)', transition: 'transform 0.2s ease',
                transform: userMenuOpen ? 'rotate(180deg)' : 'rotate(0deg)',
              }} />
            </button>

            {userMenuOpen && renderDesktopDropdown()}
          </div>
        </div>
      </nav>

      {/* === 手機版頂部 === */}
      <nav className="hide-desktop" style={{
        position: 'sticky', top: 0, zIndex: 50,
        background: 'var(--nav-bg-mobile)',
        backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
        borderBottom: '1px solid var(--border-color)',
      }}>
        <div style={{
          padding: '0 1rem', height: '56px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <Link href="/" style={{
            display: 'flex', alignItems: 'center', gap: '0.5rem',
            textDecoration: 'none', color: 'var(--text-primary)',
          }}>
            <PlaneIcon size={20} />
            <span style={{ fontSize: '0.95rem', fontWeight: 700 }}>{t('brand.name.short')}</span>
          </Link>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            {userImage ? (
              <Image src={userImage} alt={displayName} width={28} height={28} style={{
                borderRadius: '50%', objectFit: 'cover', border: '2px solid rgba(14, 165, 233, 0.3)',
              }} />
            ) : (
              <div style={{
                width: '28px', height: '28px', borderRadius: '50%',
                background: 'linear-gradient(135deg, var(--color-primary), #7c3aed)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '0.75rem', fontWeight: 700, color: '#fff',
              }}>{avatarFallback}</div>
            )}
            <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)} style={{
              background: 'none', border: 'none', color: 'var(--text-primary)', cursor: 'pointer', padding: '0.5rem',
            }}>
              {mobileMenuOpen ? <X size={22} /> : <Menu size={22} />}
            </button>
          </div>
        </div>

        {/* 手機版展開選單 */}
        {mobileMenuOpen && (
          <div style={{
            padding: '0.5rem 1rem 1rem',
            borderTop: '1px solid var(--border-color)',
            display: 'flex', flexDirection: 'column', gap: '0.25rem',
          }}>


            {/* 主題切換 */}
            <div style={{ borderTop: '1px solid var(--border-color)', marginTop: '0.5rem', paddingTop: '0.75rem' }}>
              <div style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', padding: '0 0.75rem', marginBottom: '0.375rem' }}>
                {t('menu.theme')}
              </div>
              <div style={{ display: 'flex', gap: '0.25rem', padding: '0 0.5rem', background: 'var(--bg-input)', borderRadius: '8px', margin: '0 0.25rem' }}>
                {themeOptions.map(opt => (
                  <button key={opt.value} onClick={() => setTheme(opt.value)} style={{
                    flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.25rem',
                    padding: '0.5rem', borderRadius: '6px', border: 'none', fontSize: '0.75rem',
                    fontWeight: theme === opt.value ? 600 : 400, cursor: 'pointer', transition: 'all 0.15s',
                    background: theme === opt.value ? 'var(--color-primary)' : 'transparent',
                    color: theme === opt.value ? '#fff' : 'var(--text-secondary)',
                  }}>
                    <opt.icon size={13} /> {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* 語言切換 */}
            <div style={{ paddingTop: '0.75rem' }}>
              <div style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', padding: '0 0.75rem', marginBottom: '0.375rem' }}>
                {t('menu.language')}
              </div>
              <div style={{ display: 'flex', gap: '0.25rem', padding: '0 0.5rem', background: 'var(--bg-input)', borderRadius: '8px', margin: '0 0.25rem' }}>
                {langOptions.map(opt => (
                  <button key={opt.value} onClick={() => setLocale(opt.value)} style={{
                    flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.25rem',
                    padding: '0.5rem', borderRadius: '6px', border: 'none', fontSize: '0.75rem',
                    fontWeight: locale === opt.value ? 600 : 400, cursor: 'pointer', transition: 'all 0.15s',
                    background: locale === opt.value ? 'var(--color-primary)' : 'transparent',
                    color: locale === opt.value ? '#fff' : 'var(--text-secondary)',
                  }}>
                    {opt.flag} {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* 偏好幣種 */}
            <div style={{ paddingTop: '0.75rem' }}>
              <div style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', padding: '0 0.75rem', marginBottom: '0.375rem' }}>
                💱 {t('menu.currency')}
              </div>
              <div style={{ display: 'flex', gap: '0.25rem', padding: '0.25rem 0.5rem', background: 'var(--bg-input)', borderRadius: '8px', margin: '0 0.25rem', flexWrap: 'wrap' }}>
                {quickCurrencies.slice(0, 6).map(cur => (
                  <button key={cur} onClick={() => setPreferredCurrency(cur)} style={{
                    padding: '0.375rem 0.625rem', borderRadius: '6px', border: 'none', fontSize: '0.75rem',
                    fontWeight: preferredCurrency === cur ? 600 : 400, cursor: 'pointer', transition: 'all 0.15s',
                    background: preferredCurrency === cur ? 'var(--color-primary)' : 'transparent',
                    color: preferredCurrency === cur ? '#fff' : 'var(--text-secondary)',
                  }}>
                    {ALL_CURRENCIES[cur]?.nameCn || cur}
                  </button>
                ))}
              </div>
            </div>

            {/* LINE 記帳連動 */}
            <div style={{ paddingTop: '0.75rem' }}>
              <div style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', padding: '0 0.75rem', marginBottom: '0.375rem' }}>
                💬 {t('menu.lineLink')}
              </div>
              <button
                onClick={() => { setMobileMenuOpen(false); setLineModalOpen(true) }}
                style={{
                  width: 'calc(100% - 0.5rem)', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  gap: '0.5rem', padding: '0.625rem 0.75rem', borderRadius: '8px',
                  background: 'var(--bg-input)', border: 'none', color: 'var(--text-primary)', fontSize: '0.8rem',
                  cursor: 'pointer', margin: '0 0.25rem', transition: 'background 0.15s ease',
                  textAlign: 'left'
                }}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <MessageSquare size={14} style={{ color: lineLinked ? '#06c755' : 'var(--text-secondary)' }} />
                  {lineLinked ? t('menu.lineLink.linked') : t('menu.lineLink.notLinked')}
                </span>
                {lineLinked && activeTripName && (
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '120px' }}>
                    {activeTripName}
                  </span>
                )}
              </button>
            </div>

            {/* 使用者 + 登出 */}
            <div style={{ borderTop: '1px solid var(--border-color)', marginTop: '0.75rem', paddingTop: '0.75rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', padding: '0.5rem 0.75rem', marginBottom: '0.5rem' }}>
                {userImage ? (
                  <Image src={userImage} alt={displayName} width={36} height={36} style={{
                    borderRadius: '50%', objectFit: 'cover', border: '2px solid rgba(14, 165, 233, 0.3)', flexShrink: 0,
                  }} />
                ) : (
                  <div style={{
                    width: '36px', height: '36px', borderRadius: '50%',
                    background: 'linear-gradient(135deg, var(--color-primary), #7c3aed)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '0.875rem', fontWeight: 700, color: '#fff', flexShrink: 0,
                  }}>{avatarFallback}</div>
                )}
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-primary)' }}>{displayName}</div>
                  {userEmail && <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{userEmail}</div>}
                </div>
              </div>
              <button onClick={() => signOut({ callbackUrl: '/login' })} style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: '0.5rem',
                padding: '0.625rem 0.75rem', borderRadius: '8px',
                background: 'rgba(248, 113, 113, 0.08)', border: '1px solid rgba(248, 113, 113, 0.15)',
                color: '#f87171', fontSize: '0.85rem', cursor: 'pointer', transition: 'background 0.15s',
              }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(248, 113, 113, 0.15)' }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(248, 113, 113, 0.08)' }}
              >
                <LogOut size={16} /> {t('menu.logout')}
              </button>
            </div>
          </div>
        )}
      </nav>



      {/* === LINE 帳號連動對話框 (Modal) === */}
      {lineModalOpen && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '1rem', background: 'rgba(0, 0, 0, 0.4)',
          backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
          animation: 'fadeIn 0.2s ease-out'
        }}>
          <div className="glass-card" style={{
            width: '100%', maxWidth: '380px', padding: '1.5rem',
            position: 'relative', border: '1px solid var(--border-color)',
            boxShadow: '0 20px 50px rgba(0,0,0,0.3)',
            animation: 'scaleIn 0.2s ease-out',
            background: 'var(--dropdown-bg)',
          }}>
            {/* 關閉按鈕 */}
            <button onClick={() => { setLineModalOpen(false); setLineCode("") }} style={{
              position: 'absolute', top: '1rem', right: '1rem',
              background: 'none', border: 'none', color: 'var(--text-muted)',
              cursor: 'pointer', padding: '0.25rem'
            }}>
              <X size={18} />
            </button>

            <h3 style={{
              fontSize: '0.95rem', fontWeight: 700, marginBottom: '1.25rem',
              display: 'flex', alignItems: 'center', gap: '0.5rem',
              color: 'var(--text-primary)'
            }}>
              <MessageSquare size={18} style={{ color: '#06c755' }} />
              {t('menu.lineLink')}
            </h3>

            {lineLinked ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div style={{
                  fontSize: '0.8rem', padding: '0.75rem', borderRadius: 'var(--radius)',
                  background: 'rgba(34, 197, 94, 0.08)', border: '1px solid rgba(34, 197, 94, 0.2)',
                  color: 'var(--color-success)', fontWeight: 500, lineHeight: 1.5
                }}>
                  {t('settings.lineLink.user.linked')}
                  {activeTripName && (
                    <div style={{ marginTop: '0.5rem', fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                      ⭐ {t('menu.lineLink.activeTrip').replace('{tripName}', activeTripName)}
                    </div>
                  )}
                </div>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                  您已可以直接在 LINE 傳送「品項 金額」快速記帳。若要切換預設行程，請至各行程設定頁中點選「設為預設」，或於 LINE 中傳送 `/list` 進行切換！
                </p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                  {t('settings.lineLink.desc')}
                </p>

                {lineCode ? (
                  <div style={{
                    fontSize: '0.8rem', color: 'var(--text-secondary)',
                    background: 'var(--bg-secondary)', padding: '0.75rem', borderRadius: 'var(--radius)',
                    border: '1px solid var(--border-color)', lineHeight: 1.6
                  }}>
                    <div style={{ marginBottom: '0.25rem', display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '0.375rem' }}>
                      <span>{t('settings.lineLink.step1')}</span>
                      {process.env.NEXT_PUBLIC_LINE_BOT_LINK && (
                        <a 
                          href={process.env.NEXT_PUBLIC_LINE_BOT_LINK}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            padding: '0.125rem 0.5rem',
                            background: '#06c755',
                            color: '#fff',
                            borderRadius: '4px',
                            fontSize: '0.7rem',
                            fontWeight: 600,
                            textDecoration: 'none',
                            transition: 'opacity 0.2s',
                          }}
                          onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.9' }}
                          onMouseLeave={(e) => { e.currentTarget.style.opacity = '1' }}
                        >
                          點此加好友 🚀
                        </a>
                      )}
                    </div>
                    <div style={{ marginBottom: '0.25rem' }}>{t('settings.lineLink.step2')}</div>
                    <div style={{
                      fontSize: '0.95rem', fontWeight: 700, color: 'var(--color-primary-light)',
                      fontFamily: 'monospace', display: 'flex', alignItems: 'center', gap: '0.5rem',
                      marginTop: '0.5rem', marginBottom: '0.5rem',
                      padding: '0.5rem', background: 'rgba(14, 165, 233, 0.08)', borderRadius: '6px'
                    }}>
                      /link {lineCode}
                      <button onClick={copyCommand} className="btn-secondary" style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem', display: 'inline-flex', alignItems: 'center', gap: '0.25rem', marginLeft: 'auto' }}>
                        {copied ? '已複製' : '複製'}
                      </button>
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      {t('settings.lineLink.step3')}
                    </div>
                  </div>
                ) : (
                  <button onClick={generateLineCode} className="btn-primary" disabled={generatingLineCode} style={{ background: '#06c755', borderColor: '#06c755', justifyContent: 'center' }}>
                    {generatingLineCode ? (
                      <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} />
                    ) : (
                      t('settings.lineLink.generate')
                    )}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}
