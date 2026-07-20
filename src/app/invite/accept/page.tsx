/**
 * 邀請接受頁面 — 點擊 Email 連結後的著陸頁
 * 
 * 流程：
 * 1. 已登入 → 自動加入行程 → 跳轉行程頁
 * 2. 未登入 → 顯示邀請資訊 → 引導 Google 登入 → 登入後回到此頁自動加入
 */
"use client"

import { useCallback, useEffect, useState, Suspense } from "react"
import { useSession, signIn } from "next-auth/react"
import { useRouter, useSearchParams } from "next/navigation"
import { Loader2, CheckCircle, XCircle, LogIn, Plane } from "lucide-react"
import { useLanguage } from "@/components/language-provider"
import { interpolate } from "@/lib/i18n"
import { ALL_TRIPS_PATH } from "@/lib/active-trip"

interface InviteInfo {
  tripName: string
  tripId: string
  startDate: string
  endDate: string
  inviterName: string
  email: string
}

function InviteAcceptContent() {
  const searchParams = useSearchParams()
  const token = searchParams.get("token")
  const { data: session, status: sessionStatus } = useSession()
  const router = useRouter()
  const { t } = useLanguage()

  const [inviteInfo, setInviteInfo] = useState<InviteInfo | null>(null)
  const [state, setState] = useState<"loading" | "info" | "joining" | "success" | "error">(
    token ? "loading" : "error",
  )
  const [errorMsg, setErrorMsg] = useState(token ? "" : t("invite.accept.error.missing"))
  const [hasAttempted, setHasAttempted] = useState(false)

  const acceptInvite = useCallback(async () => {
    if (!token) return
    setHasAttempted(true)
    setState("joining")

    try {
      const res = await fetch("/api/invite/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      })
      const data = await res.json()

      if (data.success) {
        setState("success")
        setTimeout(() => router.push(`/trips/${data.tripId}`), 1500)
      } else if (data.message?.includes("已經是")) {
        setState("success")
        setTimeout(() => router.push(`/trips/${data.tripId}`), 1000)
      } else {
        setState("error")
        setErrorMsg(data.error || t("invite.accept.error.joinFailed"))
      }
    } catch {
      setState("error")
      setErrorMsg(t("invite.accept.error.joinFailedRetry"))
    }
  }, [router, t, token])

  // 載入邀請資訊
  useEffect(() => {
    if (!token) {
      return
    }

    const fetchInfo = async () => {
      try {
        const res = await fetch(`/api/invite/accept?token=${token}`)
        const data = await res.json()

        // 已是成員 → 直接跳轉
        if (data.alreadyMember && data.tripId) {
          router.push(`/trips/${data.tripId}`)
          return
        }

        if (!res.ok) {
          setState("error")
          setErrorMsg(data.error || t("invite.accept.error.invalid"))
          return
        }
        setInviteInfo(data)
        setState("info")
      } catch {
        setState("error")
        setErrorMsg(t("invite.accept.error.loadFailed"))
      }
    }

    fetchInfo()
  }, [router, token, t])

  // 已登入時自動加入
  useEffect(() => {
    if (state !== "info" || !session?.user || hasAttempted) return

    const timer = window.setTimeout(() => void acceptInvite(), 0)
    return () => window.clearTimeout(timer)
  }, [acceptInvite, state, session, hasAttempted])

  const handleLogin = () => {
    // 登入後導回本頁（帶 token）
    signIn("google", {
      callbackUrl: `/invite/accept?token=${token}`,
    })
  }

  const dateRange = inviteInfo
    ? (() => {
        const s = new Date(inviteInfo.startDate)
        const e = new Date(inviteInfo.endDate)
        return `${s.getFullYear()}/${s.getMonth() + 1}/${s.getDate()} - ${e.getMonth() + 1}/${e.getDate()}`
      })()
    : ""

  return (
    <div style={{
      minHeight: "100vh",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "1.5rem",
      background: "var(--bg-primary)",
    }}>
      <div style={{
        width: "100%",
        maxWidth: "420px",
      }}>
        {/* Logo */}
        <div style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          marginBottom: "2rem",
          gap: "0.5rem",
        }}>
          <Plane size={32} style={{ color: "var(--color-primary)" }} />
          <div style={{
            fontSize: "1.1rem",
            fontWeight: 700,
            color: "var(--text-primary)",
            letterSpacing: "-0.02em",
          }}>
            {t("brand.name")}
          </div>
        </div>

        {/* 主卡片 */}
        <div className="glass-card" style={{
          padding: "2rem 1.5rem",
          textAlign: "center",
        }}>
          {/* 載入中 */}
          {state === "loading" && (
            <div>
              <Loader2 size={40} style={{
                animation: "spin 1s linear infinite",
                color: "var(--color-primary)",
                marginBottom: "1rem",
              }} />
              <p style={{ fontSize: "0.9rem", color: "var(--text-muted)" }}>
                {t("invite.accept.loading.info")}
              </p>
            </div>
          )}

          {/* 顯示邀請資訊（未登入） */}
          {state === "info" && !session && sessionStatus !== "loading" && (
            <div>
              <div style={{
                width: "56px", height: "56px", borderRadius: "50%",
                background: "linear-gradient(135deg, var(--color-primary), var(--color-accent))",
                display: "flex", alignItems: "center", justifyContent: "center",
                margin: "0 auto 1.25rem",
                fontSize: "1.5rem",
              }}>
                ✈️
              </div>

              <h1 style={{
                fontSize: "1.25rem", fontWeight: 800,
                color: "var(--text-primary)",
                marginBottom: "0.5rem",
              }}>
                {t("invite.accept.title")}
              </h1>

              <p style={{
                fontSize: "0.85rem", color: "var(--text-muted)",
                marginBottom: "1.25rem",
              }}>
                {interpolate(t("invite.accept.subtitle"), {
                  inviterName: inviteInfo?.inviterName || "",
                })}
              </p>

              {/* 行程卡片 */}
              <div style={{
                background: "rgba(14, 165, 233, 0.08)",
                border: "1px solid rgba(14, 165, 233, 0.2)",
                borderRadius: "12px",
                padding: "1rem",
                marginBottom: "1.5rem",
                textAlign: "left",
              }}>
                <div style={{
                  fontSize: "1.1rem", fontWeight: 700,
                  color: "var(--text-primary)", marginBottom: "0.375rem",
                }}>
                  {inviteInfo?.tripName}
                </div>
                <div style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
                  📅 {dateRange}
                </div>
              </div>

              {/* 登入按鈕 */}
              <button
                onClick={handleLogin}
                style={{
                  width: "100%",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  gap: "0.5rem",
                  padding: "0.875rem",
                  background: "linear-gradient(135deg, var(--color-primary), var(--color-primary-dark))",
                  color: "white",
                  border: "none",
                  borderRadius: "var(--radius)",
                  fontSize: "0.95rem",
                  fontWeight: 700,
                  cursor: "pointer",
                  transition: "all 0.2s",
                }}
              >
                <LogIn size={18} />
                {t("invite.accept.loginBtn")}
              </button>

              <p style={{
                fontSize: "0.72rem", color: "var(--text-muted)",
                marginTop: "0.75rem",
              }}>
                {t("invite.accept.loginTip")}
              </p>
            </div>
          )}

          {/* 載入 session 或自動加入中 */}
          {(state === "joining" || (state === "info" && (sessionStatus === "loading" || session))) && (
            <div>
              <Loader2 size={40} style={{
                animation: "spin 1s linear infinite",
                color: "var(--color-primary)",
                marginBottom: "1rem",
              }} />
              <p style={{ fontSize: "0.9rem", color: "var(--text-muted)" }}>
                {t("invite.accept.joining")}
              </p>
            </div>
          )}

          {/* 成功 */}
          {state === "success" && (
            <div>
              <CheckCircle size={48} style={{
                color: "var(--color-success)",
                marginBottom: "1rem",
              }} />
              <h2 style={{
                fontSize: "1.1rem", fontWeight: 700,
                color: "var(--text-primary)", marginBottom: "0.5rem",
              }}>
                {t("invite.accept.success")}
              </h2>
              <p style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>
                {t("invite.accept.redirecting")}
              </p>
            </div>
          )}

          {/* 錯誤 */}
          {state === "error" && (
            <div>
              <XCircle size={48} style={{
                color: "var(--color-danger)",
                marginBottom: "1rem",
              }} />
              <h2 style={{
                fontSize: "1.1rem", fontWeight: 700,
                color: "var(--text-primary)", marginBottom: "0.5rem",
              }}>
                {t("invite.accept.failed")}
              </h2>
              <p style={{
                fontSize: "0.85rem", color: "var(--text-muted)",
                marginBottom: "1.25rem",
              }}>
                {errorMsg}
              </p>
              <button
                onClick={() => router.push(ALL_TRIPS_PATH)}
                className="btn-secondary"
                style={{ justifyContent: "center", width: "100%" }}
              >
                {t("invite.accept.backHome")}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default function InviteAcceptPage() {
  return (
    <Suspense fallback={
      <div style={{
        minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <Loader2 size={32} style={{ animation: "spin 1s linear infinite", color: "var(--color-primary)" }} />
      </div>
    }>
      <InviteAcceptContent />
    </Suspense>
  )
}
