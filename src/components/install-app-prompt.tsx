"use client"

import * as Dialog from "@radix-ui/react-dialog"
import { Download, MonitorDown, PlusSquare, Share2, Smartphone, X } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { useLanguage } from "./language-provider"

const INSTALL_DISMISS_KEY = "travel-expense-install-dismissed-until"
const DISMISS_DURATION_MS = 7 * 24 * 60 * 60 * 1000

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>
}

type AppleInstallMode = "ios" | "mac-safari" | null

function isStandaloneMode() {
  const navigatorWithStandalone = navigator as Navigator & { standalone?: boolean }
  return window.matchMedia("(display-mode: standalone)").matches
    || navigatorWithStandalone.standalone === true
}

function detectAppleInstallMode(): AppleInstallMode {
  const userAgent = navigator.userAgent
  const isIOS = /iPad|iPhone|iPod/.test(userAgent)
    || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)

  if (isIOS) return "ios"

  const isSafari = /Safari/.test(userAgent) && !/Chrome|Chromium|CriOS|Edg|OPR/.test(userAgent)
  return isSafari && /Macintosh/.test(userAgent) ? "mac-safari" : null
}

export function InstallAppPrompt() {
  const { t } = useLanguage()
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [appleMode, setAppleMode] = useState<AppleInstallMode>(null)
  const [standalone, setStandalone] = useState(true)
  const [dismissed, setDismissed] = useState(true)
  const [instructionsOpen, setInstructionsOpen] = useState(false)
  const [installing, setInstalling] = useState(false)
  const installButtonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const alreadyStandalone = isStandaloneMode()
    const detectedAppleMode = alreadyStandalone ? null : detectAppleInstallMode()
    let dismissedUntil = 0

    try {
      dismissedUntil = Number(localStorage.getItem(INSTALL_DISMISS_KEY) || 0)
    } catch {
      dismissedUntil = 0
    }

    const initializeTimer = window.setTimeout(() => {
      setStandalone(alreadyStandalone)
      setAppleMode(detectedAppleMode)
      setDismissed(dismissedUntil > Date.now())
    }, 0)

    if (alreadyStandalone) {
      return () => window.clearTimeout(initializeTimer)
    }

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault()
      setInstallPrompt(event as BeforeInstallPromptEvent)
    }

    const handleInstalled = () => {
      setStandalone(true)
      setInstallPrompt(null)
      setInstructionsOpen(false)
      try {
        localStorage.removeItem(INSTALL_DISMISS_KEY)
      } catch {
        // 安裝成功後即使儲存空間不可用，也不影響本次狀態。
      }
    }

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt)
    window.addEventListener("appinstalled", handleInstalled)
    return () => {
      window.clearTimeout(initializeTimer)
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt)
      window.removeEventListener("appinstalled", handleInstalled)
    }
  }, [])

  const dismiss = () => {
    setDismissed(true)
    setInstructionsOpen(false)
    try {
      localStorage.setItem(INSTALL_DISMISS_KEY, String(Date.now() + DISMISS_DURATION_MS))
    } catch {
      // 私密瀏覽模式可能禁用儲存空間，隱藏本次提示即可。
    }
  }

  const install = async () => {
    if (!installPrompt) {
      setInstructionsOpen(true)
      return
    }

    setInstalling(true)
    try {
      await installPrompt.prompt()
      const choice = await installPrompt.userChoice
      setInstallPrompt(null)
      if (choice.outcome === "accepted") {
        setStandalone(true)
      }
    } catch {
      setInstructionsOpen(true)
    } finally {
      setInstalling(false)
    }
  }

  const canOfferInstall = Boolean(installPrompt || appleMode)
  if (standalone || dismissed || !canOfferInstall) return null

  const isIOS = appleMode === "ios"
  const isMacSafari = appleMode === "mac-safari"

  return (
    <>
      <aside className="pwa-install-card" aria-label={t("install.title")} data-pwa-install-card>
        <div className="pwa-install-icon" aria-hidden="true">
          {isIOS ? <Smartphone size={22} /> : <MonitorDown size={22} />}
        </div>
        <div className="pwa-install-copy">
          <strong>{t("install.title")}</strong>
          <span>{t("install.subtitle")}</span>
        </div>
        <button className="pwa-install-dismiss" type="button" onClick={dismiss} aria-label={t("install.dismiss")}>
          <X size={17} />
        </button>
        <button
          ref={installButtonRef}
          className="pwa-install-action"
          type="button"
          onClick={install}
          disabled={installing}
        >
          <Download size={16} />
          {installPrompt
            ? (installing ? t("install.installing") : t("install.action"))
            : t("install.instructions")}
        </button>
      </aside>

      <Dialog.Root open={instructionsOpen} onOpenChange={setInstructionsOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="pwa-install-overlay" />
          <Dialog.Content
            className="pwa-install-dialog"
            aria-describedby={undefined}
            onCloseAutoFocus={(event) => {
              event.preventDefault()
              installButtonRef.current?.focus()
            }}
          >
            <Dialog.Close asChild>
              <button
                type="button"
                className="pwa-install-dialog-close"
                aria-label={t("install.close")}
              >
                <X size={19} />
              </button>
            </Dialog.Close>
            <div className="pwa-install-dialog-icon" aria-hidden="true">
              {isIOS ? <Smartphone size={28} /> : <MonitorDown size={28} />}
            </div>
            <Dialog.Title>
              {isIOS
                ? t("install.ios.title")
                : isMacSafari
                  ? t("install.mac.title")
                  : t("install.desktop.title")}
            </Dialog.Title>
            <ol className="pwa-install-steps">
              {isIOS ? (
                <>
                  <li><Share2 size={18} /> <span>{t("install.ios.step1")}</span></li>
                  <li><PlusSquare size={18} /> <span>{t("install.ios.step2")}</span></li>
                  <li><Download size={18} /> <span>{t("install.ios.step3")}</span></li>
                </>
              ) : (
                <>
                  <li><MonitorDown size={18} /> <span>{isMacSafari ? t("install.mac.step1") : t("install.desktop.step1")}</span></li>
                  <li><PlusSquare size={18} /> <span>{isMacSafari ? t("install.mac.step2") : t("install.desktop.step2")}</span></li>
                </>
              )}
            </ol>
            <Dialog.Close asChild>
              <button type="button" className="btn-primary pwa-install-done">
                {t("install.done")}
              </button>
            </Dialog.Close>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  )
}
