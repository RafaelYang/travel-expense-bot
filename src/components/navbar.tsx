/**
 * 導覽列元件 — 桌面版頂部 + 手機版底部 Tab Bar
 */
"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useSession, signOut } from "next-auth/react"
import { Plane, PlusCircle, Settings, LogOut, User, Menu, X } from "lucide-react"
import { useState } from "react"

export function Navbar() {
  const { data: session } = useSession()
  const pathname = usePathname()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  if (!session) return null

  const navItems = [
    { href: "/", label: "行程總覽", icon: Plane },
    { href: "/trips/new", label: "新增行程", icon: PlusCircle },
  ]

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/"
    return pathname.startsWith(href)
  }

  return (
    <>
      {/* === 桌面版導覽列 === */}
      <nav className="hide-mobile" style={{
        position: 'sticky',
        top: 0,
        zIndex: 50,
        background: 'rgba(15, 23, 42, 0.85)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        borderBottom: '1px solid var(--border-color)',
      }}>
        <div style={{
          maxWidth: '1200px',
          margin: '0 auto',
          padding: '0 1.5rem',
          height: '64px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          {/* Logo */}
          <Link href="/" style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            textDecoration: 'none',
            color: 'var(--text-primary)',
          }}>
            <span style={{ fontSize: '1.5rem' }}>✈️</span>
            <span style={{ fontSize: '1.125rem', fontWeight: 700, letterSpacing: '-0.02em' }}>
              小銘子記帳
            </span>
          </Link>

          {/* 導覽連結 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
            {navItems.map(item => (
              <Link
                key={item.href}
                href={item.href}
                className={`nav-link ${isActive(item.href) ? 'active' : ''}`}
                style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}
              >
                <item.icon size={16} />
                {item.label}
              </Link>
            ))}
          </div>

          {/* 使用者選單 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              padding: '0.375rem 0.75rem',
              borderRadius: 'var(--radius)',
              background: 'rgba(14, 165, 233, 0.1)',
            }}>
              <User size={14} style={{ color: 'var(--color-primary)' }} />
              <span style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                {session.user?.name || session.user?.email}
              </span>
            </div>
            <button
              onClick={() => signOut({ callbackUrl: '/login' })}
              className="btn-secondary"
              style={{ padding: '0.375rem 0.75rem', fontSize: '0.8rem' }}
            >
              <LogOut size={14} />
              登出
            </button>
          </div>
        </div>
      </nav>

      {/* === 手機版頂部 === */}
      <nav className="hide-desktop" style={{
        position: 'sticky',
        top: 0,
        zIndex: 50,
        background: 'rgba(15, 23, 42, 0.92)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        borderBottom: '1px solid var(--border-color)',
      }}>
        <div style={{
          padding: '0 1rem',
          height: '56px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <Link href="/" style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            textDecoration: 'none',
            color: 'var(--text-primary)',
          }}>
            <span style={{ fontSize: '1.25rem' }}>✈️</span>
            <span style={{ fontSize: '1rem', fontWeight: 700 }}>小銘子記帳</span>
          </Link>

          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-primary)',
              cursor: 'pointer',
              padding: '0.5rem',
            }}
          >
            {mobileMenuOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>

        {/* 手機版展開選單 */}
        {mobileMenuOpen && (
          <div style={{
            padding: '0.5rem 1rem 1rem',
            borderTop: '1px solid var(--border-color)',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.25rem',
          }}>
            {navItems.map(item => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileMenuOpen(false)}
                className={`nav-link ${isActive(item.href) ? 'active' : ''}`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  padding: '0.75rem',
                }}
              >
                <item.icon size={18} />
                {item.label}
              </Link>
            ))}
            <div style={{
              borderTop: '1px solid var(--border-color)',
              marginTop: '0.5rem',
              paddingTop: '0.5rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                {session.user?.name || session.user?.email}
              </span>
              <button
                onClick={() => signOut({ callbackUrl: '/login' })}
                className="btn-secondary"
                style={{ padding: '0.375rem 0.75rem', fontSize: '0.8rem' }}
              >
                <LogOut size={14} />
                登出
              </button>
            </div>
          </div>
        )}
      </nav>

      {/* === 手機版底部 Tab Bar === */}
      <div className="hide-desktop" style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 50,
        background: 'rgba(15, 23, 42, 0.95)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        borderTop: '1px solid var(--border-color)',
        display: 'flex',
        justifyContent: 'space-around',
        padding: '0.5rem 0 calc(0.5rem + env(safe-area-inset-bottom))',
      }}>
        {navItems.map(item => (
          <Link
            key={item.href}
            href={item.href}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '0.25rem',
              padding: '0.375rem 1rem',
              textDecoration: 'none',
              color: isActive(item.href) ? 'var(--color-primary)' : 'var(--text-muted)',
              fontSize: '0.7rem',
              fontWeight: isActive(item.href) ? 600 : 400,
              transition: 'color 0.2s',
            }}
          >
            <item.icon size={20} />
            {item.label}
          </Link>
        ))}
        <Link
          href="/settings"
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '0.25rem',
            padding: '0.375rem 1rem',
            textDecoration: 'none',
            color: isActive('/settings') ? 'var(--color-primary)' : 'var(--text-muted)',
            fontSize: '0.7rem',
            fontWeight: isActive('/settings') ? 600 : 400,
            transition: 'color 0.2s',
          }}
        >
          <Settings size={20} />
          設定
        </Link>
      </div>
    </>
  )
}
