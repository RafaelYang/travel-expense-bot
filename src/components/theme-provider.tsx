/**
 * 主題管理 — 深色 / 淺色 / 跟隨系統
 */
"use client"

import { createContext, useContext, useEffect, useState, useCallback } from "react"

type Theme = "light" | "dark" | "system"

interface ThemeContextType {
  theme: Theme
  resolvedTheme: "light" | "dark"
  setTheme: (theme: Theme) => void
}

const ThemeContext = createContext<ThemeContextType>({
  theme: "system",
  resolvedTheme: "dark",
  setTheme: () => {},
})

export function useTheme() {
  return useContext(ThemeContext)
}

function getSystemTheme(): "light" | "dark" {
  if (typeof window === "undefined") return "dark"
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("system")
  const [resolvedTheme, setResolvedTheme] = useState<"light" | "dark">("dark")
  const [mounted, setMounted] = useState(false)

  // 初始化：從 localStorage 讀取
  useEffect(() => {
    const saved = localStorage.getItem("theme") as Theme | null
    if (saved && ["light", "dark", "system"].includes(saved)) {
      setThemeState(saved)
    }
    setMounted(true)
  }, [])

  // 解析實際主題 + 套用到 <html>
  const applyTheme = useCallback((t: Theme) => {
    const resolved = t === "system" ? getSystemTheme() : t
    setResolvedTheme(resolved)
    document.documentElement.setAttribute("data-theme", resolved)
  }, [])

  useEffect(() => {
    if (!mounted) return
    applyTheme(theme)
  }, [theme, mounted, applyTheme])

  // 監聽系統主題變化
  useEffect(() => {
    if (!mounted) return
    const mq = window.matchMedia("(prefers-color-scheme: dark)")
    const handler = () => {
      if (theme === "system") {
        applyTheme("system")
      }
    }
    mq.addEventListener("change", handler)
    return () => mq.removeEventListener("change", handler)
  }, [theme, mounted, applyTheme])

  const setTheme = (t: Theme) => {
    setThemeState(t)
    localStorage.setItem("theme", t)
  }

  // 避免 hydration 閃爍
  if (!mounted) {
    return <>{children}</>
  }

  return (
    <ThemeContext.Provider value={{ theme, resolvedTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}
