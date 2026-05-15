# EditHistory.md — 小銘子記帳機器人

## 2026-05-15 — 專案初建

### Phase 1: 基礎建設
- 初始化 Next.js 16 專案（TypeScript + Tailwind CSS 4 + App Router）
- 安裝核心依賴：Prisma 7 + @prisma/adapter-pg + NextAuth v5 + @line/bot-sdk + Radix UI + Lucide Icons + date-fns + zod
- 建立 Prisma Schema（9 個模型：User, Account, Session, Trip, TripMember, Expense, Deposit, InviteCode, LineBotState, LineTripLink, ExchangeRateCache）
- 設定 Prisma 7 adapter 模式（使用 @prisma/adapter-pg 連接 Supabase PostgreSQL）
- 建立 NextAuth v5 認證系統（Credentials Provider + Prisma Adapter）
- 建立登入/註冊頁面（深色毛玻璃卡片風格）
- 建立 Middleware 路由保護
- 建立全域 CSS 設計系統（深色主題、毛玻璃效果、進度條動畫、按鈕樣式）

### Phase 2: 核心功能
- 建立行程 CRUD API（/api/trips）
- 建立花費記帳 API（/api/trips/[tripId]/expenses）
- 建立儲值 API（/api/trips/[tripId]/deposits）
- 建立邀請碼系統（/api/trips/[tripId]/invite + /api/trips/join）
- 建立 BudgetProgress 元件（核心動畫：數字跳動 + 進度條 + 顏色狀態變化）
- 建立首頁 Dashboard（行程列表、進行中脈動效果、加入行程表單）
- 建立行程主頁（預算追蹤 + 快速記帳 + 花費列表 + 分類統計 + 成員列表）
- 建立新增行程頁面（含幣種選擇、日期、預算設定）
- 建立行程設定頁（邀請碼管理、狀態切換、刪除確認）
- 建立導覽列元件（桌面版頂部 + 手機版漢堡選單 + 底部 Tab Bar）

### 建立的檔案清單
- `prisma/schema.prisma`
- `src/lib/prisma.ts` — Prisma 7 adapter 模式
- `src/lib/auth.ts` — NextAuth v5 設定
- `src/lib/utils.ts` — 共用工具（格式化、分類、幣種定義）
- `src/types/next-auth.d.ts` — 型別擴充
- `src/middleware.ts` — 路由保護
- `src/app/globals.css` — 設計系統
- `src/app/layout.tsx` — 根 Layout
- `src/app/page.tsx` — 首頁 Dashboard
- `src/app/login/page.tsx` — 登入頁
- `src/app/register/page.tsx` — 註冊頁
- `src/app/trips/new/page.tsx` — 新增行程
- `src/app/trips/[tripId]/page.tsx` — 行程主頁
- `src/app/trips/[tripId]/settings/page.tsx` — 行程設定
- `src/app/api/auth/[...nextauth]/route.ts`
- `src/app/api/auth/register/route.ts`
- `src/app/api/trips/route.ts`
- `src/app/api/trips/[tripId]/route.ts`
- `src/app/api/trips/[tripId]/expenses/route.ts`
- `src/app/api/trips/[tripId]/deposits/route.ts`
- `src/app/api/trips/[tripId]/invite/route.ts`
- `src/app/api/trips/join/route.ts`
- `src/components/navbar.tsx`
- `src/components/budget-progress.tsx`
- `.env` / `.env.example`

## 2026-05-15 — 認證系統改為 Google + LINE OAuth

### 改動概述
- 移除 Credentials（帳號密碼）登入，改為 Google OAuth 唯一登入
- 加入 LINE Login，登入後自動綁定 LINE User ID（用於推播通知）
- 加入帳號合併邏輯：LINE-first 使用者後續用 Google 登入時自動合併
- 加入 Vercel 部署設定

### 修改的檔案
- `src/lib/auth.ts` — 全面改用 Google + LINE Provider，移除 Credentials + bcrypt
- `src/app/login/page.tsx` — 改為 Google 彩色 logo + LINE 綠色按鈕
- `src/middleware.ts` — 移除 /register 路徑
- `src/types/next-auth.d.ts` — 簡化型別擴充
- `prisma/schema.prisma` — 移除 password 欄位、PasswordResetToken model
- `.env` / `.env.example` — 加入 GOOGLE_CLIENT_ID/SECRET、LINE_CLIENT_ID/SECRET

### 刪除的檔案
- `src/app/register/page.tsx` — 不再需要註冊頁
- `src/app/api/auth/register/route.ts` — 不再需要註冊 API

### 新增的檔案
- `vercel.json` — Vercel 部署設定（prisma generate + db push + next build）

### 移除的依賴
- `bcrypt` / `@types/bcrypt` — 不再需要密碼雜湊
