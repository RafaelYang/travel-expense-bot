/**
 * 語言管理 Provider
 * 儲存到 localStorage，支援 zh-TW / en
 */
"use client"

import { createContext, useContext, useSyncExternalStore, useCallback } from "react"
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

const LANGUAGE_CHANGE_EVENT = "travel-expense-language-change"

function getLocaleSnapshot(): Locale {
  const saved = localStorage.getItem("locale")
  return saved === "en" || saved === "zh-TW" ? saved : "zh-TW"
}

function subscribeLocale(onStoreChange: () => void) {
  window.addEventListener("storage", onStoreChange)
  window.addEventListener(LANGUAGE_CHANGE_EVENT, onStoreChange)
  return () => {
    window.removeEventListener("storage", onStoreChange)
    window.removeEventListener(LANGUAGE_CHANGE_EVENT, onStoreChange)
  }
}

export function useLanguage() {
  return useContext(LanguageContext)
}

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const locale = useSyncExternalStore<Locale>(subscribeLocale, getLocaleSnapshot, () => "zh-TW")

  const setLocale = (l: Locale) => {
    localStorage.setItem("locale", l)
    window.dispatchEvent(new Event(LANGUAGE_CHANGE_EVENT))
  }

  const t = useCallback((key: string, params?: Record<string, string>): string => {
    const dict = translations[locale] || translations["zh-TW"]
    const text = dict[key] || translations["zh-TW"][key] || key
    return interpolate(text, params)
  }, [locale])

  return (
    <LanguageContext.Provider value={{ locale, setLocale, t }}>
      {children}
    </LanguageContext.Provider>
  )
}
