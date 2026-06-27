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
  const { t } = useLanguage()

  const [editForm, setEditForm] = useState({
    name: "",
    description: "",
    startDate: "",
    endDate: "",
    baseCurrency: "",
  })

  useEffect(() => {
    fetchTrip()
  }, [tripId])

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
      await fetch(`/api/trips/${tripId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editForm),
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
