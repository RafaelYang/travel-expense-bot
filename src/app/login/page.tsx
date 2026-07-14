/**
 * 登入頁面 — Google + LINE OAuth
 */
"use client"

import { useState } from "react"
import { signIn } from "next-auth/react"
import { Loader2 } from "lucide-react"
import { useLanguage } from "@/components/language-provider"

export default function LoginPage() {
  const [loadingProvider, setLoadingProvider] = useState<string | null>(null)
  const { t } = useLanguage()

  const handleLogin = async (provider: string) => {
    setLoadingProvider(provider)
    await signIn(provider, { callbackUrl: "/" })
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '1.5rem',
      position: 'relative',
    }}>
      {/* 背景裝飾 */}
      <div style={{
        position: 'absolute',
        top: '15%',
        left: '10%',
        width: '300px',
        height: '300px',
        borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(14, 165, 233, 0.08), transparent 70%)',
        filter: 'blur(60px)',
      }} />
      <div style={{
        position: 'absolute',
        bottom: '20%',
        right: '15%',
        width: '250px',
        height: '250px',
        borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(139, 92, 246, 0.06), transparent 70%)',
        filter: 'blur(60px)',
      }} />

      <div className="glass-card animate-fade-in-up" style={{
        width: '100%',
        maxWidth: '420px',
        padding: '2.5rem',
        position: 'relative',
        zIndex: 1,
      }}>
        {/* Logo 區域 */}
        <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '72px',
            height: '72px',
            borderRadius: '18px',
            background: 'linear-gradient(135deg, rgba(14, 165, 233, 0.2), rgba(139, 92, 246, 0.2))',
            marginBottom: '1.25rem',
            fontSize: '2.5rem',
          }}>
            ✈️
          </div>
          <h1 style={{
            fontSize: '1.75rem',
            fontWeight: 800,
            letterSpacing: '-0.03em',
            marginBottom: '0.5rem',
            background: 'linear-gradient(135deg, var(--text-primary), var(--color-primary-light))',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
          }}>
            {t('login.title')}
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: 1.6 }}>
            {t('login.desc')}<br />
            <span style={{ fontSize: '0.8rem' }}>{t('login.desc2')}</span>
          </p>
        </div>

        {/* 登入按鈕 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
          {/* Google 登入 */}
          <button
            onClick={() => handleLogin("google")}
            disabled={!!loadingProvider}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.75rem',
              width: '100%',
              padding: '0.875rem 1rem',
              borderRadius: 'var(--radius)',
              border: '1px solid var(--border-color)',
              background: 'rgba(255, 255, 255, 0.04)',
              color: 'var(--text-primary)',
              fontSize: '0.9rem',
              fontWeight: 600,
              cursor: loadingProvider ? 'wait' : 'pointer',
              opacity: loadingProvider && loadingProvider !== 'google' ? 0.5 : 1,
              transition: 'all 0.2s ease',
            }}
            onMouseEnter={(e) => {
              if (!loadingProvider) {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)'
                e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.2)'
                e.currentTarget.style.transform = 'translateY(-1px)'
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.04)'
              e.currentTarget.style.borderColor = 'var(--border-color)'
              e.currentTarget.style.transform = 'translateY(0)'
            }}
          >
            {loadingProvider === 'google' ? (
              <Loader2 size={20} style={{ animation: 'spin 1s linear infinite' }} />
            ) : (
              <svg width="20" height="20" viewBox="0 0 24 24">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
            )}
            {t('login.google')}
          </button>
        </div>
      </div>
    </div>
  )
}
