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

## 2026-05-15 — 使用者頭像下拉選單 + Vercel 部署

### 改動概述
- 右上角使用者區域改為 Google 頭像 + 名字 + 下拉箭頭
- 點擊展開毛玻璃下拉選單，顯示帳號資訊（頭像、名字、Email）+ 登出按鈕
- 手機版漢堡選單也整合頭像 + 登出
- Prisma Client 改為 Proxy 延遲初始化（避免 Vercel build 時嘗試 DB 連線）
- 部署至 Vercel：https://travel-expense-bot-steel.vercel.app

### 修改的檔案
- `src/components/navbar.tsx` — 頭像 + 下拉選單重構
- `src/app/globals.css` — 新增 fadeInDown 動畫
- `src/lib/prisma.ts` — Proxy 延遲初始化
- `next.config.ts` — 加入 Google/LINE 圖片 domain 白名單
- `vercel.json` — 簡化 buildCommand
- `prisma.config.ts` — 移除不支援的 directUrl

## 2026-05-15 — 主題切換 + 登入跳轉修正

### 改動概述
- 修正線上登入後跳 localhost 的問題（Vercel 加入 NEXTAUTH_URL 環境變數）
- 加入深色/淺色/跟隨系統的主題切換功能
- 主題選項整合在頭像下拉選單中，三個按鈕橫排（淺色 ☀️ / 深色 🌙 / 系統 🖥️）
- 防閃爍：layout.tsx 加入 inline script，在 hydration 前就套用正確主題
- 選擇儲存到 localStorage，下次開啟自動套用

### 新增的檔案
- `src/components/theme-provider.tsx` — 主題管理 Context + Provider

### 修改的檔案
- `src/app/globals.css` — 加入 [data-theme="light"] 淺色變數 + 淺色背景漸層
- `src/app/layout.tsx` — 包裹 ThemeProvider + 防閃爍 script
- `src/components/navbar.tsx` — 下拉選單加入主題切換區

## 2026-05-16 — 修正 Vercel 生產環境 OAuth 登入

### 問題描述
Google OAuth 在 Vercel 生產環境無法登入，callback 成功回來但 session 未被建立。

### 根因分析
1. Prisma Client 使用 Proxy 延遲初始化與 PrismaAdapter 不相容
2. 自訂 cookies 設定（`__Secure-` + `sameSite: none`）導致 PKCE state 驗證異常
3. middleware 使用 `getToken()` 無法正確讀取 NextAuth v5 在 HTTPS 下的 cookie

### 修正內容
- `src/lib/prisma.ts` — 移除 Proxy 模式，改回直接初始化 PrismaClient
- `src/lib/auth.ts` — 移除自訂 cookies 設定，改用 NextAuth 預設值
- `src/middleware.ts` — 改用 cookie 存在性檢查（同時支援 `__Secure-authjs.*` 和 `authjs.*`）
- Vercel 環境變數加入 `NEXTAUTH_URL=https://travel-expense-bot-steel.vercel.app`

## 2026-05-16 — 品牌更新 + i18n + 下拉子選單

### 改動概述
- 品牌名稱改為「小銘子旅行用記帳」/ "Ming's Travel Expense"
- Logo 從 ✈️ emoji 改為黑色飛機剪影 SVG
- Favicon 改為飛機剪影 SVG
- 下拉選單：主題和語言改為 hover 展開子選單（二級選單）
- 加入多語系（i18n）系統：繁體中文 + English

### 新增的檔案
- `src/lib/i18n.ts` — 翻譯字典（zh-TW / en）
- `src/components/language-provider.tsx` — 語言管理 Context
- `public/favicon.svg` — 飛機剪影 SVG favicon

### 修改的檔案
- `src/components/navbar.tsx` — 完全重寫：飛機 logo、hover 子選單、語言切換
- `src/app/layout.tsx` — 加入 LanguageProvider + SVG favicon
- `src/app/page.tsx` — 首頁文字改用 t() 翻譯
- `src/app/login/page.tsx` — 登入頁文字改用 t() 翻譯

## 2026-05-17 — 匯率 API 升級為每小時更新

### 改動概述
- 匯率來源從 open.er-api.com（每日更新）改為 CurrencyBeacon（每小時更新）
- 新增 `/api/exchange-rate` API proxy route，前端不再直接呼叫外部 API
- API key 安全存放在伺服器端，前端透過 proxy 查詢
- 備用來源：當 CurrencyBeacon 異常時自動 fallback 到 open.er-api.com

### 新增的檔案
- `src/app/api/exchange-rate/route.ts` — 匯率查詢 API proxy

### 修改的檔案
- `src/lib/exchange-rate.ts` — 改用 CurrencyBeacon API + fallback 機制
- `src/app/trips/[tripId]/page.tsx` — 前端改走 `/api/exchange-rate` proxy
- `.env` — 加入 `EXCHANGE_RATE_API_KEY`

## 2026-05-17 — 行程卡片視覺升級

### 改動概述
- 行程卡片改為全寬佈局（不再用 grid 卡片）
- 日期格式加上年份（`yyyy/M/d`）
- 行程排序改為由新到舊（`startDate desc`）
- 卡片背景使用對應國家的城市風景照片（Unsplash）
- 暗色遮罩確保文字可讀性，hover 時背景放大動畫
- 顯示國旗 emoji

### 修改的檔案
- `src/app/page.tsx` — 全寬 TripCard + 城市背景照
- `src/lib/countries.ts` — 新增 COUNTRY_COVER_IMAGES / getCountryCoverImage / getCountryFlags
- `src/app/api/trips/route.ts` — 排序改為 startDate desc
- `src/app/globals.css` — 新增 trip-card-bg hover 動畫

## 2026-05-29 — 修正成員列表被記帳按鈕遮蓋

### 問題描述
行程主頁點擊「成員」標籤展開成員列表 popup 時，popup 被下方的「記帳」按鈕遮蓋（z-index 層疊問題）。

### 根因分析
成員列表 popup 使用 `position: absolute` + `zIndex: 30`，但它的父容器（`.glass-card`）沒有建立 stacking context，導致後續 DOM 元素（記帳按鈕）自然覆蓋在上面。

### 修正內容
- `src/app/trips/[tripId]/page.tsx`
  - 行程標題卡片加上 `position: relative` + 動態 `zIndex`（展開成員列表時提高為 10）
  - 成員列表 popup 的 `zIndex` 從 30 提高到 60
  - popup 的 `boxShadow` 加深，視覺上更明確浮在上層

## 2026-05-29 — Email 邀請加入行程

### 改動概述
新增 Email 邀請功能：在行程設定頁輸入對方 Email → 系統自動寄送精美邀請信 → 對方點連結一鍵加入行程。
未註冊的使用者會被引導 Google 登入（自動註冊），登入後自動加入。

### 新增的檔案
- `src/app/api/trips/[tripId]/invite-email/route.ts` — Email 邀請 API（Resend 寄信 + HTML 模板）
- `src/app/api/invite/accept/route.ts` — 接受邀請 API（GET 查詢邀請資訊 + POST 加入行程）
- `src/app/invite/accept/page.tsx` — 邀請接受頁面（已登入自動加入 / 未登入引導 Google 登入）

### 修改的檔案
- `prisma/schema.prisma` — 新增 EmailInvite model + Trip relation
- `src/app/trips/[tripId]/settings/page.tsx` — 加入 Email 邀請卡片（輸入框 + 發送按鈕 + 成功/錯誤提示）
- `src/lib/i18n.ts` — 新增 Email 邀請相關翻譯（中/英）
- `src/middleware.ts` — 將 `/invite` 路徑加入白名單（允許未登入存取）
- `.env` — 新增 RESEND_API_KEY

### 新增的依賴
- `resend` — Email 寄送服務（免費方案 100 封/天）

### 技術細節
- 邀請 token 為 UUID，7 天有效
- 重複邀請同一 Email 會重用既有 token（不重複建立）
- Email HTML 模板：深色漸層風格，含行程資訊卡片 + CTA 按鈕
- 寄件人：`小銘子記帳 <onboarding@resend.dev>`（Resend 免費方案）
- Vercel 環境變數已設定 RESEND_API_KEY

## 2026-06-12 — 專案清理：移除不必要檔案

### 刪除的檔案
- `過場動畫.mp4` — 與 `public/loading.mp4` 完全相同（MD5 一致），根目錄的是多餘複本
- `.DS_Store` — macOS 系統產生的隱藏檔
- `public/file.svg` — Next.js 範本預設檔，程式碼中未引用
- `public/globe.svg` — Next.js 範本預設檔，程式碼中未引用
- `public/next.svg` — Next.js 範本預設檔，程式碼中未引用
- `public/vercel.svg` — Next.js 範本預設檔，程式碼中未引用
- `public/window.svg` — Next.js 範本預設檔，程式碼中未引用
- `.vscode/settings.json` — 內容為空物件 `{}`，無任何設定（整個 `.vscode` 目錄移除）
- `CLAUDE.md` — 僅一行 `@AGENTS.md`，功能已由 AGENTS.md 覆蓋
- `.next/` — 構建快取目錄（494MB），`npm run build` 可重新產生

## 2026-06-27 — 新增防止 Supabase 暫停之自動化工作流

### 改動概述
- 新增 GitHub Actions 自動化工作流，定時（每天早上 8 點）自動連線並查詢資料庫一次，以防止 Supabase 免費版專案因無活動而被自動暫停。

### 新增的檔案
- `.github/workflows/keep-alive.yml` — 每日自動執行 ping-db 的 workflow 檔案。

## 2026-06-27 — 實作 LINE Bot 快速記帳與連動功能

### 改動概述
- 實作了 LINE Bot Webhook API，支援以 `/link [連動碼]` 綁定旅遊行程。
- 實作了 LINE 快速記帳語法解析與自動分類，使用者可直接傳送如「拉麵 1500 JPY」或「捷運 35」進行多幣種自動記帳。
- 在行程設定頁面加入 LINE 連動綁定 UI 與多語系對應詞條，提供詳細的三步連動教學。

### 新增的檔案
- `src/app/api/trips/[tripId]/line-link/route.ts` — 產生 LINE 行程連動碼 API
- `src/app/api/line/webhook/route.ts` — LINE Messaging API Webhook 路由

### 修改的檔案
- `src/app/trips/[tripId]/settings/page.tsx` — 行程設定頁新增 LINE 連動 UI
- `src/lib/i18n.ts` — 新增 LINE 相關翻譯詞條

## 2026-06-27 — LINE 個人帳號綁定、Carousel 輪播切換與記帳狀態提示

### 改動概述
- 將 LINE 綁定重構為「個人帳號永久綁定」，使用 `VerificationToken` 機制提供 15 分鐘有效的 6 位數個人配對碼，免去資料庫 Migration 變更。
- 重構 LINE Webhook，支援在 LINE 傳送 `/link [個人配對碼]` 完成綁定。
- LINE Webhook 支援 `/list`、`切換`、`行程` 指令，以 LINE Carousel Template 輸出使用者名下的所有行程輪播卡片，點選卡片按鈕透過 Postback Event 一鍵切換預設記帳行程。
- 記帳與狀態查詢時自動推算行程天數進度 (`Day X/Y`)。針對「未開始」或「已結束」的過期行程，自動在 LINE 記帳回應中跳出警示提示以防呆。
- 行程設定頁 UI 重構：改為雙層 LINE 綁定狀態顯示。第一部分為個人帳號綁定狀態；第二部分為本行程是否為 LINE 預設記帳行程，並提供網頁端「一鍵設為 LINE 預設記帳行程」按鈕。

### 新增的檔案
- `src/app/api/users/line-link/route.ts` — 產生個人 LINE 帳號連動碼 API
- `upload-rich-menu.js` — 一鍵解析、上傳並將本地「圖文選單.png」設為預設圖文選單的自動化腳本

### 修改的檔案
- `src/app/api/trips/[tripId]/line-link/route.ts` — 擴充支援 GET (查詢狀態) 與 PUT (網頁端一鍵切換預設)
- `src/app/api/line/webhook/route.ts` — 重構支援個人綁定、輪播卡片、Postback 切換與行程天數警告提示
- `src/components/navbar.tsx` — 全域選單整合 LINE 狀態與毛玻璃彈窗對話框
- `src/app/trips/[tripId]/settings/page.tsx` — 簡化連動 UI，依帳號連動狀態提供相應引導與一鍵設定按鈕
- `src/lib/i18n.ts` — 擴充全域選單、Modal 與行程狀態的多語系翻譯詞條

## 2026-06-28 — LINE 圖片記帳防呆與多筆選單 & 自動目的地幣別 Quick Reply
### 修改概述
- **LINE 傳送圖片自動附加**：Webhook 新增處理 `image` 類型訊息，自動下載圖片並轉為 Base64 Data URL 寫入 Expense 資料庫，前端網頁直接無縫支援。
- **多筆記帳嚴謹防呆**：當使用者在最近 10 分鐘內有多筆記帳時，系統會自動回應 Buttons Template 按鈕選單，讓使用者在 LINE 對話中一鍵挑選這張收據/圖片屬於哪一筆消費，徹底避免錯置。
- **自動目的地幣別與 Quick Reply 切換**：
  - 新增 `/currency [三碼]` 與 `/currency` 指令，支援在 LINE 快速切換與鎖定預設記帳幣別，利用狀態編碼（`tripId:currency`）技術實現免 Migration 輕量儲存。
  - 當使用者記帳成功或查詢 `/status` 時，系統會**自動對照行程目的地國家的法定貨幣**（例如去奧、捷、匈，會自動出現歐元 EUR、克朗 CZK、福林 HUF），並與台灣人常用 4 種幣別（台幣、日圓、美金、歐元）合併去重，以 **中文+英文（如：⭐ 歐元 EUR）** 的 LINE 快速回覆 (Quick Reply) 按鈕呈現於鍵盤上方，點選即可一鍵切換。

### 修改的檔案
- `src/app/api/line/webhook/route.ts` — 實作處理 `image` 事件、`saveLineImageToExpense`、新增 `/currency` 指令、自動目的地對照 `getQuickReply` 函數。

## 2026-06-28 — 2x2 圖文選單更新與 LINE 記帳清單（目前花費）、智慧多國風景圖、對話式編輯與刪除互動
### 修改概述
- **更新圖文選單上傳腳本 (`upload-rich-menu.js`)**：調整為全新的 2x2 四等份版面，並綁定對應的按鈕動作（左上首頁、右上目前花費、左下目前行程、右下行程清單）。
- **「目前花費」查詢與日期快速選單**：
  - 當收到 `/expenses` 或點選「目前花費」時，系統以 Quick Reply 列出行程的各個日期與 `🔍 其他日期` 按鈕。
  - 使用者點選日期後，系統會回傳 **Carousel 輪播卡片** 以左右滑動展示該日消費詳情。
  - 針對 LINE 10 張卡片的上限做了**智慧分頁防呆**（前 N 筆消費 + 尾卡「今日結算與前往網頁」）。
- **智慧目的地國家風景照演算法**：當消費卡片沒有上傳圖片備註時，系統會自動根據「總天數與國家數」，以「智慧均分演算法」算出該天對應的目的地國家，並顯示對應國家的 Unsplash 風景底圖（支持台灣、日本、韓國、奧地利、捷克、匈牙利等多個國家），極致美觀。
- **無痛對話式編輯 (Stateless Prompt)**：點選卡片下方 `✏️ 編輯` 按鈕可呼叫 Quick Reply。點選「改項目名稱」或「改金額」後，系統會在 `VerificationToken` 中建立對話狀態鎖定 5 分鐘，使用者的下一句文字輸入會被 Webhook 攔截並直接寫入該筆消費（若修改金額，會自動重新呼叫 API 計算匯率台幣換算），隨後解除鎖定，流暢度如同微型 App。
- **一鍵刪除功能**：點選 `❌ 刪除` 即可直接透過 Webhook 刪除資料庫該筆花費並回覆成功。
- **雙向幣別切換與狀態優化**：
  - 微調行程清單 Carousel 卡片按鈕，將「設為預設記帳行程」優化為「設定為目前行程」或「此為目前行程」，相容 `tripId:currency` 的格式。
  - 網頁端行程設定頁面 (`settings/page.tsx`) 新增顯示當前 LINE 記帳預設幣別，並提供一整排快速切換按鈕，使用者在網頁點擊即可直接修改其 LINE Bot 的預設記帳幣別，達成極致的雙向連動。

### 修改的檔案
- `src/app/api/trips/[tripId]/line-link/route.ts` — 在 GET 中回傳當前記帳幣別，在 PUT 中支援接收 body.currency。
- `src/app/trips/[tripId]/settings/page.tsx` — 網頁端連動 UI 擴充 lineCurrency 狀態、getTripCurrencies 獲取可用幣別與 updateLineCurrency 一鍵點擊切換。
- `src/app/api/line/webhook/route.ts` — 實作 /expenses 日期選單、handleDateExpensesQuery 卡片輪播（智慧國家風景圖均分與總結卡防呆）、handleDeleteExpense 一鍵刪除、handleEditField / handleDirectTextUpdate 的 Stateless 鎖定與文字輸入攔截。
- `upload-rich-menu.js` — 重新適應最新的 2x2 圖文選單切割坐標與 Actions 綁定。

## 2026-06-28 — 智慧時區自適應查詢與網頁版自訂每日目的地國家
### 修改概述
- **網頁端自訂每日目的地國家**：
  - 在網頁版 **「行程設定 (Settings)」** 頁面基本資料區塊內，新增 **「🗺️ 每日目的地國家設定」** 控制介面。
  - 對於行程每一天（如 Day 1, Day 2），列出行程已選取的所有目的地國家（如 🇹🇼 台灣、🇯🇵 日本），並以漂亮的國旗圓角按鈕呈現。使用者點選即可指定當日目的地。
  - 監聽行程時間變動，當行程日期（開始或結束日期）修改時，自動智慧增刪並補齊 dailyCountries 陣列長度。
  - **資料庫兼容存儲**：將每日分配表與國家列表以 JSON 結構包裝並儲存於 Prisma 的 `countries` (PostgreSQL `String[]` 陣列的第一個元素中)，實現 **0 資料庫 Migration 開銷** 下的 100% 向後相容。
- **LINE Webhook 主要目的地時區自適應 (Timezone Offset Adaptive)**：
  - 新增 `COUNTRY_TIMEZONE_MAP` 全球主要國家時區對照表。
  - 重構 `parseTripCountries` 小工具，支援陣列/物件等多元 JSON 格式相容，取得特定天數的 `activeCountry` 目的地。
  - 在 `getExpensesDatesQuickReply` 與 `handleOtherDatesCommand` 生成日期選單時，將消費記錄的 UTC 時間轉為「目的地當天時區」日期字串進行本地化歸類，避免跨時區造成的日期拆分錯誤。
  - 在 `handleDateExpensesQuery` 查詢當天消費卡片時，先獲取當天的目的地時區偏移，動態偏移 `startOfDay` 與 `endOfDay` 對資料庫進行精確 UTC 時間點區間查詢，**徹底防範跨時區（特別是清晨或深夜）記帳的歸類錯置**。
- **全域 Quick Reply 安全防錯**：在 `replyMessage` 發送端新增自動過濾器，若 `quickReply.items` 為空，將在發送前將其自動移除，防範 LINE HTTP 400 報錯。

### 修改的檔案
- `src/app/api/trips/route.ts` — 在 POST 新增行程 API 中，根據行程起訖日數，將所有天數的 dailyCountries 預設初始化為第一個目的地國家，完全停用自動均分。
- `src/app/api/trips/[tripId]/route.ts` — 在 PUT 修改行程 API 中新增支援 `countries` 欄位的更新與保存。
- `src/app/trips/[tripId]/settings/page.tsx` — 新增 countriesList 與 dailyCountries 狀態，實作 useEffect 日期監聽補齊，並在設定 Form 中繪製每日目的地國家設定 UI 與發送 payload。
- `src/app/api/line/webhook/route.ts` — 定義 `COUNTRY_TIMEZONE_MAP`，重構 `parseTripCountries` 以相容解析單元素 JSON string 陣列，調整 `getExpensesDatesQuickReply`、`handleOtherDatesCommand` 與 `handleDateExpensesQuery` 使用目的地時區計算起訖時間與解析日期，並在 `replyMessage` 加入 items 為空的安全過濾防護。
