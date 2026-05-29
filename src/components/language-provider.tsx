/**
 * 語言管理 Provider
 * 儲存到 localStorage，支援 zh-TW / en
 */
"use client"

import { createContext, useContext, useEffect, useState, useCallback } from "react"
import { type Locale, translations, interpolate } from "@/lib/i18n"

interface LanguageContextType {
  locale: Locale
  setLocale: (locale: Locale) => void
  t: (key: string, params?: Record<string, string>) => string
}

const LanguageContext = createContext<LanguageContextType>({
  locale: "zh-TW",
  setLocale: () => {},
  t: (key) => key,
})

export function useLanguage() {
  return useContext(LanguageContext)
}

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>("zh-TW")
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    const saved = localStorage.getItem("locale") as Locale | null
    if (saved && (saved === "zh-TW" || saved === "en")) {
      setLocaleState(saved)
    }
    setMounted(true)
  }, [])

  const setLocale = (l: Locale) => {
    setLocaleState(l)
    localStorage.setItem("locale", l)
  }

  const t = useCallback((key: string, params?: Record<string, string>): string => {
    const dict = translations[locale] || translations["zh-TW"]
    const text = dict[key] || translations["zh-TW"][key] || key
    return interpolate(text, params)
  }, [locale])

  if (!mounted) {
    return <>{children}</>
  }

  return (
    <LanguageContext.Provider value={{ locale, setLocale, t }}>
      {children}
    </LanguageContext.Provider>
  )
}
