/**
 * 根 Layout — 全站共用框架
 */
import type { Metadata, Viewport } from "next"
import { Huninn } from "next/font/google"
import { SessionProvider } from "next-auth/react"
import { InstallAppPrompt } from "@/components/install-app-prompt"
import { ThemeProvider } from "@/components/theme-provider"
import { LanguageProvider } from "@/components/language-provider"
import "./globals.css"

const huninn = Huninn({
  weight: "400",
  display: "swap",
  variable: "--font-huninn",
  preload: false,
  fallback: ["PingFang TC", "Microsoft JhengHei", "sans-serif"],
})

export const metadata: Metadata = {
  title: "小銘子旅行用記帳 — 旅遊記帳好幫手",
  description: "出門旅遊的記帳好夥伴，支援多人共用行程、即時預算追蹤、匯率轉換、LINE 機器人記帳",
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/images/pwa/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: [
      { url: "/images/pwa/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
  },
  appleWebApp: {
    capable: true,
    title: "小銘子記帳",
    statusBarStyle: "default",
  },
}

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f8fafc" },
    { media: "(prefers-color-scheme: dark)", color: "#0f172a" },
  ],
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="zh-TW" className={huninn.variable} suppressHydrationWarning>
      <head>
        {/* 防止主題切換閃爍 */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  var theme = localStorage.getItem('theme') || 'system';
                  var resolved = theme;
                  if (theme === 'system') {
                    resolved = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
                  }
                  document.documentElement.setAttribute('data-theme', resolved);
                } catch(e) {}
              })();
            `,
          }}
        />
      </head>
      <body>
        <SessionProvider>
          <ThemeProvider>
            <LanguageProvider>
              {children}
              <InstallAppPrompt />
            </LanguageProvider>
          </ThemeProvider>
        </SessionProvider>
      </body>
    </html>
  )
}
