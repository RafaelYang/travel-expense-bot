# 專案修改歷史紀錄 (Edit History)

> [!NOTE]
> 2026-06-27 之前的早期修改歷史已轉移歸檔至 [EditHistory_archive.md](file:///Volumes/RafaelSSD/Antigravity/小銘子記帳機器人/EditHistory_archive.md)。

---

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
- **新增行程頁面自訂每日目的地**：在「新增行程 (New Trip)」頁面中，當起訖日期與國家選取後，動態渲染一排國旗按鈕，引導使用者在建立行程的第一時間完成每一天的目的地自訂分配。
- **無跨時區國家統一時區偏移**：新增 `getTripTimezoneOffset` 工具函數。當行程去過的所有目的地國家對照出來的時區均相同時（如都是歐洲中部時區 UTC+2），直接統一回傳此偏移量，避開了不必要的依天數分配偏差，僅在真正的「跨時區」行程中才依當日目的地自適應轉換。
- **舊行程資料庫一鍵清理**：建立臨時 API 腳本，透過動態 import `@prisma/client` 先行初始化 dotenv 讀取，成功連線 Supabase PostgreSQL 並清空所有舊有測試行程（Cascade 級聯清理所有記帳、儲值、成員），重新測試。

- **LINE Webhook 卡片查詢安全防禦與出錯回報**：
  - 在 `handleDateExpensesQuery` 中，為圖片陣列的 `startsWith` 呼叫加上 `typeof === "string"` 判定，防止當資料庫欄位儲存了 `null` 等非預期 JSON 值時崩潰。
  - 為 `handleDateExpensesQuery` 補上 `catch` 回覆塊，一旦伺服器內部發生任何未預期的 runtime exception，將主動在 LINE 對話框印出 `❌ 載入消費卡片失敗，請稍候重試。錯誤詳情：...`，拒絕死寂。

- **LINE 幣別快速選單常駐優化 (QuickReply Persistence)**：
  - 在記帳語法解析失敗的「格式錯誤說明」回覆中，自動載入並注入當前行程的幣值快速選單，使用戶在輸入一般對話文字或打錯字時，鍵盤上方能立馬彈出幣值按鈕。
  - 在對話式編輯 (`handleDirectTextUpdate`) 的「項目名稱修改成功」與「金額修改成功」回覆中，同樣補上當前行程的幣值 `quickReply`，讓使用者編輯完任何花費資訊後，體驗不會斷掉，幣別選單依舊常駐在鍵盤上方。

- **LINE Carousel 卡片按鈕數量一致化修正 (Carousel Actions Count Alignment)**：
  - 修復了 LINE API 回傳 HTTP 400 Bad Request 拒絕發送訊息的 Bug。
  - 原因在於 LINE Carousel 模板要求各個卡片欄位（columns）中的 action 按鈕數量、標題與圖片的使用必須完全一致。
  - 我們將原本只有 1 個按鈕的「今日結算卡片」與「還有更多卡片」，同樣補上第 2 個按鈕（📅 查詢其他日期，觸發 `/expenses_other_dates` 訊息），使其與帶有 2 個編輯/刪除按鈕的實體花費卡片完美對齊，順利通過 LINE 伺服器端驗證。

- **智慧消費分類主題圖片優先機制 (Defensive Theme Image Priority)**：
  - 為解決行程開始前（如出發前幾個月預定機票/飯店/門票）記帳時，因無對應天數目的地而導致圖片單調或無法貼合意境的問題。
  - 新增 `CATEGORY_IMAGE_MAP`，定義了餐飲（food，美食照）、交通（transport，飛機雲海照）、住宿（accommodation，精品房照）、購物（shopping，血拼照）、門票/景點（ticket，古堡教堂照）的主題示意圖。
  - 重構卡片渲染的圖片優先級：優先使用使用者自行上傳的照片；其次，若無上傳照，則根據消費的分類 (Category) 自動套用對應的主題精美圖；最後，若分類為 `other` 或是沒匹配到，才 Fallback 顯示該天的目的地國家風景照。

- **卡片編輯支援修改消費幣別 (Currency Edit Support in Cards)**：
  - 於消費卡片下方的 `✏️ 編輯` 按鈕中，新增 **`💱 修改消費幣別`** 選項。
  - 當使用者點選後，系統會自動查找該行程所屬國家的幣別以及常用四種幣別，並以 Quick Reply 按鈕呈現。
  - 使用者點選新幣別後，系統會**自動對該筆花費重新進行匯率換算與 TWD 台幣金額重算**，並保存至資料庫中。

### 修改的檔案
- `src/app/trips/new/page.tsx` — 新增 `dailyCountries` 狀態與監聽 useEffect，並在基準幣種選單下方置入每日目的地設定 UI。
- `src/app/api/trips/route.ts` — 在 POST 新增行程 API 中，根據行程起訖日數，將所有天數的 dailyCountries 預設初始化為第一個目的地國家，完全停用自動均分。
- `src/app/api/trips/[tripId]/route.ts` — 在 PUT 修改行程 API 中新增支援 `countries` 欄位的更新與保存。
- `src/app/trips/[tripId]/settings/page.tsx` — 新增 countriesList 與 dailyCountries 狀態，實作 useEffect 日期監聽補齊，並在設定 Form 中繪製每日目的地國家設定 UI 與發送 payload。
- `src/app/api/line/webhook/route.ts` — 統一 Carousel 所有卡片的 `actions` 數量為 2 個（補上「查詢其他日期」按鈕），於記帳錯誤提示與 `handleDirectTextUpdate` 編輯成功回覆中引入 `quickReply` 機制，強化 `handleDateExpensesQuery` 的圖片欄位 `startsWith` 字串防禦，補上出錯回報 `catch` 回覆塊，新增 `getTripTimezoneOffset` 時區檢查機制，定義 `COUNTRY_TIMEZONE_MAP`，重構 `parseTripCountries` 以相容解析單元素 JSON string 陣列，調整 `getExpensesDatesQuickReply`、`handleOtherDatesCommand` 與 `handleDateExpensesQuery` 使用目的地時區計算起訖時間與解析日期，並在 `replyMessage` 加入 items 為空的安全過濾防護。

- **實作自傳 Base64 圖片代理路由 (Proxy Endpoint for Uploaded Images)**：
  - 由於 LINE 官方 Carousel 卡片中 `thumbnailImageUrl` 限制必須是 HTTPS 實體圖鏈，若直接帶入儲存於資料庫的 `data:image/...` Base64 資料會導致 LINE API 回報 400 錯。
  - 新建 `src/app/api/trips/expenses/images/[expenseId]/route.ts` 路由，接受 `index` 參數並讀取資料庫。如果是 Base64 圖片，則自動解碼以二進位流回傳，並自適應設定 `Content-Type` 和 1 天的 `Cache-Control` 快取。
  - 重構 `handleDateExpensesQuery` 的圖片決策鏈，若有上傳的 Base64 圖片，動態產出代理 HTTPS 網址，徹底解決了「有上傳圖片卻在 LINE 卡片上無法顯示」的 Bug。

- **交通工具細緻意圖匹配 (Transportation Sub-category Matching)**：
  - 為使記帳品項與圖片背景更加貼合，當花費歸類在 `transport` (交通) 時，新增品項文字智慧偵測：若包含「機票/飛機/航空/flight/plane」等關鍵字，就使用飛機雲海圖；若是其他字樣（如車票、火車、巴士、地鐵等），則自動配發極具質感的「歐洲紅色鐵道風景照」，使用體驗大幅躍升。

- **移除 LINE 不支援的 Markdown 標記格式修正 (Markdown Symbols Cleanup)**：
  - 移除了連結帳號成功提示、幣別切換成功提示、幣別手動設定範例、金額修改提示中的所有星號 `**` 及反引號 `` ` `` 標記，改以 LINE 能完美原生呈現的乾淨純文字與引號替代。

- **幣種設定選單說明優化 (Currency Selector Instructions Optimization)**：
  - 為了在使用者開啟「幣種設定」時提供更明確的 UI 指引，於 `/currency` 的手動切換說明文字中，新增「請選擇下方快速選單進行切換，帶有 ⭐ 的按鈕即代表目前的記帳幣別」的溫馨說明。

- **更多常見幣別選單與手動引導強化 (Alternative Currencies Quick Reply & Flow)**：
  - 於常用幣別選單中，當使用者點選「🔍 其他」時，不再發送無意義的重複指令，而是發送 `/currency_other` 指令。
  - Webhook 攔截該指令並回傳全新的「更多常見幣別選單」 (包含韓元 KRW、泰銖 THB、人民幣 CNY、英鎊 GBP、加幣 CAD、澳幣 AUD、新加坡幣 SGD、馬幣 MYR、瑞士法郎 CHF、紐元 NZD 等 10 種常見旅遊貨幣)。
  - 新增「🔙 返回常用」按鈕可隨時切回原本的目的地+常用幣別選單。
  - 在說明文字中，強烈提示使用者「若選單中依然沒有您需要的幣別，您也可以直接手動輸入指令來設定（例如：輸入 /currency GBP 即可設定為英鎊）！」，完美解決手動設定的指引。

- **常用幣別選單極簡與動態去重 (Default Currencies Simplification & Deduplication)**：
  - 應使用者要求，精簡第一頁常用幣別快速選單（Quick Reply）。
  - 第一頁預設常用選單**僅會顯示「行程基準/偏好幣別 (trip.baseCurrency || 'TWD')」+「該此旅行的目的地國家法定幣別」+「當前鎖定幣別」+「🔍 其他」**，其餘非此行程關聯的常用幣別不再顯示。
  - 在「🔍 其他」第二頁中，會**動態計算並自動過濾掉已在第一頁顯示的偏好與目的地幣別**，確保兩頁之間完全不重複，達到極致清爽的 UI 體驗。

- **修改/刪除消費後自動載入當天花費清單 (Auto-Reload Expense List on Modify Success)**：
  - 應使用者要求，在 LINE 記帳機器人中進行消費項目編輯（如修改品項名稱、修改金額、修改分類、修改記帳幣別）或一鍵刪除消費成功後，機器人除了回覆成功訊息外，還會**自動重新渲染並夾帶發送該消費原本日期當天最新、最即時的「目前花費」輪播卡片與今日結算資訊**，免去使用者手動點按查詢的繁瑣步驟。
  - 同步確保在夾帶多個訊息時，底部快速選單（Quick Reply）仍能精準繫結在最後一個訊息上，完美符合 LINE API 規範。

### 修改的檔案
- `upload-rich-menu.js` — 修改左下角按鈕對應 the Action 動作為發送 `/currency` 文字訊息。
- `src/app/api/trips/expenses/images/[expenseId]/route.ts` [NEW] — 新增代理下載解碼 Base64 並輸出實體 JPEG 二進位流 the API 圖片代理端點。
- `src/app/api/trips/[tripId]/route.ts` — 在 PUT 修改行程 API 中對 `countries` 欄位進行防禦性類型轉換，若前端傳送裸字串時自動包裝為陣列，符合 `String[]` 規格。
- `src/app/trips/[tripId]/settings/page.tsx` — 實作安全遞迴解碼 `cleanExtractCountries` 函數，在讀取資料庫時自動過濾與解開可能存在的多層嵌套 JSON 髒資料，並在儲存時改以標準的單一字串陣列 `[string]` 送出，阻斷再次嵌套。
- `src/app/api/line/webhook/route.ts` — 修正 `handleUpdateField` (分類與幣別)、`handleDirectTextUpdate` (品項名稱與金額) 和 `handleDeleteExpense` (一鍵刪除) 的成功回覆，在發送成功訊息時同時調用 `getExpenseDateQueryMessages` 將對應日期的花費卡片一併附帶回傳；將 `handleDateExpensesQuery` 的卡片產生邏輯重構拆分為獨立的 `buildDateExpensesMessages` 輔助函數以供多處拼裝；將 `parseTripCountries` 重構為遞迴安全解包版本，防止被歷史嵌套髒資料干擾，完美抓出目的地國家二碼；重構 `getQuickReply` 以精簡預設選單至僅有偏好與目的地幣種，重構 `getOtherQuickReply` 新增動態去重過濾機制；新增 `/currency_other` 更多常見幣別選單及 handler 邏輯；修正自傳 Base64 圖片代理的 URL 格式，解決 App Router 404 一片白的問題，同時智慧辨識機票與車票子類別主題圖，並移除所有的 Markdown 雙星號及反引號標記。

- **行程封面照自訂與自動 Fallback 機制 (Trip Cover Image Customization & Fallback)**：
  - 網頁端主頁行程卡片新增支援優先讀取 `trip.coverImage` 欄位，若未設定自訂封面，則自動 fallback 使用目的地國家對應的 Unsplash 精美城市風景照，若目的地無預設照片則使用預設地圖。
  - 行程更新 `PUT /api/trips/[tripId]` API 新增對 `coverImage` 欄位的接收與資料庫儲存。
  - 在「行程設定」頁面中，新增了高質感的「行程封面照」編輯區塊，包含：
    - 即時封面照預覽（可即時展示輸入 URL 或點按精選風景照的效果）。
    - 提供 Input 框供使用者直接填入自訂的 HTTPS 圖片網址。
    - 提供精選風景照滾動清單（日本京都、首爾夜景、泰國寺廟、法國巴黎、歐洲鐵道等），點按即可秒切換，亦提供「🎯 目的地預設」按鈕，點擊可清空自訂網址並回歸目的地預設照片。

### 修改的檔案 (追加)
- `src/app/page.tsx` — 擴充 `Trip` 介面，並將 `TripCard` 卡片封面改為優先使用自訂封面，無自訂封面時自動 fallback 目的地國家預設封面。
- `src/app/api/trips/[tripId]/route.ts` — 在 `PUT` 更新 API 中新增對 `coverImage` 欄位的接收與儲存以支援行程封面照更新。
- `src/app/trips/[tripId]/settings/page.tsx` — 引入 `getCountryCoverImage` 並在 TripSettings 介面、狀態與 payload 中加入 `coverImage` 欄位，同時在 UI 中新增封面預覽、自訂網址與精選美圖滾動選取元件。

- **精選封面圖新增奧地利風景 (Recommended Covers Add Austria)**：
  - 在「行程設定」頁面的推薦封面圖滾動選單中，新增了「奧地利湖畔」精選風景照選項（對應奧地利 Hallstatt 的經典湖畔美景）。

- **設定頁面區塊重組與移除 LINE 記帳狀態區塊 (Settings Sections Reordering & LINE Link Removal)**：
  - 應使用者要求，在「行程設定」頁面中，將原本頗佔版面的「💬 LINE 快速記帳與連動」設定 Card 完全拿掉，精簡設定介面。
  - 將「基本設定」區塊（包含行程名稱、日期設定、每日目的地國家設定、以及全新實作的行程封面照預覽與選取元件）整體移到最頂端（放置於「邀請碼區塊」之前）。
  - 這解決了原本基本設定與封面照設定因版面過長而被擠到最下方、導致使用者「找不到可以設定圖片的地方」之體驗痛點，現在一進設定頁就能立刻在最上方進行封面照自訂。

- **歷史 JSON 目的地髒資料防禦性解碼 (Nested JSON Countries Fallback Fix)**：
  - 發現部分現有舊行程的 `countries` 欄位中，因為歷史 Bug 存入了多重嵌套 JSON 字串（如 `"{\"list\":[\"{\\\"list\\\":[...`），導致首頁 `TripCard` 渲染與旗幟轉換時無法比對出正確的國家代碼。
  - 在 `src/lib/countries.ts` 中，實作了防禦性的 `extractCleanCountries` 遞迴解碼函數，並無縫套用至 `getCountryCoverImage` 與 `getCountryFlags` 中，自動淨化任何歷史嵌套資料。這使得首頁現有舊行程能瞬間恢復配對，成功顯示奧地利的 Hallstatt 風景照與國旗！

- **行程封面照上傳功能與中英文多語系支持 (Cover Image Upload & Translations)**：
  - 在 `src/lib/i18n.ts` 中分別為中文和英文補齊了 `settings.coverImage.*` 相關的標籤、占位符及提示翻譯字典項目，完美解決原本在畫面上直接裸露顯示 key 的問題。
  - 在「行程設定」頁面中，實作了隱藏的 file input 及本機 FileReader 圖片讀取機制（限制 1.5MB 以內以維護資料庫載入效能）。上傳的圖片會自動編碼為 Base64 寫入 `editForm.coverImage`，並在前端即時呈現預覽，在點選儲存後即可寫入資料庫並於首頁展示。
  - 改善輸入框體驗：若當前設定為上傳圖片（以 `data:` 開頭之 Base64），輸入框會自動防禦性顯示「已選擇本機上傳圖片 (Base64) / [Local Upload Image (Base64)]」並將輸入框設為唯讀狀態，若點按其他精選風景照或預設目的地封面即可清除並重置輸入框，體驗非常滑順。

- **消費花費日期調整功能 (Expense Date Editing on Web & LINE Bot)**：
  - **後端 API**：修改 `src/app/api/trips/[tripId]/expenses/[expenseId]/route.ts` 中的 updateSchema (Zod) 加上 `date: z.string().optional()`，並在 PATCH 處理中將 data.date 轉為 JavaScript Date 物件更新入庫。
  - **網頁端 (Web)**：將「所有花費」清單的時間格式由原本的 `M/d HH:mm` 修改為 `yyyy/M/d HH:mm` 以呈現完整年份。在 `EditExpenseModal` 編輯模式中新增了 `<input type="datetime-local">` 消費時間選擇器，並於儲存時經由 PATCH API 將更新日期送出。
  - **LINE 機器人 (LINE Bot)**：
    - 在 `handleEditExpenseMenu` 內新增「📅 修改消費日期」按鈕。
    - 點選後於 `handleEditField` 內動態計算該行程 `startDate` 與 `endDate` 之間的所有天數，產生快速回覆 (Quick Reply) 日期按鈕（例如 6/29），並同時啟動對話式 `VerificationToken` 的 5 分鐘欄位鎖定。
    - 點選日期 Quick Reply 後會發送 Postback `action=update_field&field=date&value=2026-06-29`，經由 `handleUpdateField` 解析日期並寫入資料庫。
    - 若使用者在對話框直接打字，會在 `handleDirectTextUpdate` 被攔截。實作了 `parseUserDateInput` 輔助函數，支援年/月/日、月/日，以及單一日期數字（自動以出發月份為基準補齊）的智慧解析。
    - 修正了 LINE 機器人在修改品項、金額、日期等欄位後，因為使用舊 `expense` 物件渲染導致推播明細卡片沒同步更新的歷史 Bug，全面改用資料庫 update 後的 latest expense，提供 100% 準確的即時卡片更新回饋！

- **花費統計改版：今日花費改為每日花費折線圖 (Chart Refactoring for Stats Modal)**：
  - **語言字典**：於 `src/lib/i18n.ts` 中新增了 `trip.dailySpendTrend` 鍵值（中文：「📈 每日花費趨勢」，英文：「📈 Daily Spend Trend」）。
  - **資料處理**：在 `src/app/trips/[tripId]/page.tsx` 中實作了行程每日消費的聚合邏輯，並對 `convertedAmount` 設計了防禦性 null/undefined fallback機制。
  - **圖表繪製**：在統計 Modal（`StatsModal`）中移除了原本的 `📅 今日花費` 列表區塊，並引入一個以純 SVG ＋ CSS 漸變陰影填充繪製的極精緻「每日花費折線圖」。
  - **極致設計細節**：折線圖支援單日金額大於 1000 時自動精簡為 `k`（如 `1.5k`）顯示，防堵長數字重疊擠壓；若當天無消費則僅顯示微小灰色圓點不標示金額；X 軸日期 label 依據行程天數大小自適應抽樣（例如大於 12 天時隔天抽樣），防堵標籤擠壓。

- **花費分類統計幣值 Bug 修正 (Category Spend Currency Conversion Bug Fix)**：
  - 發現原本的 `categoryStats` 統計累加時直接使用原始外幣金額 `e.amount`，但 UI 渲染時卻套用基準幣別台幣的 Symbol，造成數值與下方總花費發生極大偏差（例如外幣 €5,000 在分類中顯示為 NT$5,000）。
  - 將其改為使用折算後的 `e.convertedAmount ?? e.amount ?? 0` 進行累加，成功與行程總花費對齊，修復分類金額錯亂問題！
- **折線圖包含行程外消費日期重構 (Daily Trend Chart Date Auto-Expansion)**：
  - 改善使用者在出發前提前購買機票/門票（例如提前一個月 6/1 的消費）無法被折線圖收錄的情況。
  - 重構 `chartDays` 點位產生邏輯：不再是死板地一天天從 startDate 累加到 endDate，而是動態收集「行程每日日期」與「行程外有消費記錄的所有日期」至 Set 中去重並從小到大排序。
  - 時間軸點會直接包含 `6/1`、`6/29`、`6/30`...，且中間沒有消費的空天數不會被以 0 元填充，確保折線圖能夠精美顯示所有包含行程外的真實消費，並且點位分佈在 SVG 中依然保持響應式均勻分佈。

- **折線圖標籤字體大小優化 (Stats Chart Font Size Optimization)**：
  - 根據實際渲染反饋，將折線圖上的金額標籤與 X 軸日期標籤之字體大小 `fontSize` 從原本偏小的 `8` 與 `8.5` 統一調大至更清晰的 `11` (約 11px)。
  - 同步微調金額標籤的 Y 軸位移為 `y={p.y - 10}`，防範字體放大後與折線節點發生重疊，確保在各行動裝置與網頁瀏覽器中均能輕鬆辨識閱讀。

- **行動版 Notch 瀏海與 Modal 頂部遮擋優化 (Mobile SafeArea and Modal Top Obstruction Fix)**：
  - **遮擋原因**：當在手機版（特別是 Notch 瀏海手機如 iPhone、或有頂部標題列的 LINE 內置瀏覽器）開啟 Modal（如分享行程、花費統計、花費詳情）時，若卡片太長（maxHeight 達 85vh）且缺乏安全區域偏移，Modal 會緊貼螢幕上緣，導致右上角的關閉叉叉按鈕剛好與手機系統列或瀏覽器返回鍵重合而關不掉。全螢幕 Lightbox 圖片檢視時的關閉叉叉也有同樣被瀏海蓋住的現象。
  - **安全偏移設計**：將所有 Modal 的 zIndex 從 `999` 大幅提升至 `20000`，並將遮罩層的 `padding` 升級為 `padding: 'calc(1.5rem + env(safe-area-inset-top)) 1.5rem 1.5rem 1.5rem'`，配合將 `maxHeight` 微調至 `80vh`。這保證任何手機瀏覽器下 Modal 卡片都會被向下推移出頂部安全區，給予右上角叉叉按鈕寬裕的點擊空間。
  - **圖片 Lightbox 修正**：將全螢幕圖片 Lightbox 的遮罩 zIndex 提高至 `30000`，關閉按鈕 zIndex 提高至 `31000`，並將關閉按鈕的 `top` 屬性加上適配 Notch 的 `env(safe-area-inset-top)` 高度，保證大圖不會蓋過按鈕，且叉叉按鈕絕不被狀態列遮擋。

## 2026-06-28 — 圖片滑動手勢與 Sticky Header 遮擋消除修正

### 修改概述
- **解除層疊上下文限制**：將 `showShareModal` 與 `showStatsModal` 移動至 `</main>` 的外部（與 `EditExpenseModal` 同級渲染），徹底擺脫同級 `<Navbar />` 的遮擋限制。
- **行動版 Lightbox 左右滑動手勢 (Swipe Gestures)**：在主頁面的 Lightbox 與 `EditExpenseModal` 的兩個 Lightbox 中，透過 `onTouchStart`、`onTouchMove` 與 `onTouchEnd` 紀錄 `clientX` 滑動差值，當橫向滑動距離大於 50px 時，智慧切換至上一張/下一張照片，極致提升手機端相簿體驗。
- **Modal 結構改版為 Sticky Header**：
  - 重構 `showShareModal`、`showStatsModal` 與 `EditExpenseModal` 的 CSS 版面為 `flexDirection: 'column'` 與 `overflow: 'hidden'`。
  - 將 Header 與關閉叉叉按鈕設定為固定不滾動區 (`flexShrink: 0`)，下方內容物或表單包裹在 `overflowY: 'auto'` 的獨立滾動容器中。這確保當花費統計圖表或表單內容過多時，頂部的關閉叉叉按鈕仍能恆定浮貼於 Modal 頂端，不隨滾動條移出螢幕。
- **專案建置驗證**：成功跑通 `npx tsc --noEmit` 驗證，無任何 TypeScript 與 JSX 標籤閉合問題。

## 2026-06-28 — 解決詳情/編輯 Modal 的 Stacking Context 限制與 Safari 叉叉按壓區優化

### 修改概述
- **徹底解除 EditExpenseModal 的層疊上下文限制**：先前只移除了 `showShareModal` 和 `showStatsModal`，而 `EditExpenseModal` (詳情與編輯 Modal) 仍遺留在 `<main>` 內部。這導致網頁的 `<Navbar />` 依然會覆蓋在詳情 Modal 與全螢幕 Lightbox 的頂部，遮擋了右上角的關閉叉叉。現已將 `EditExpenseModal` 也移出 `<main>` 元素外，徹底讓所有彈窗與大圖 Lightbox 浮在最上層，不再被 Navbar 遮擋。
- **調大 Modal 頂部安全距離 (Mobile Padding Offset)**：為了相容 iOS Safari 頂部 URL 列與系統狀態列（Notch 瀏海），將所有 Modal 遮罩層的頂部 padding 從 `calc(1.5rem + env(safe-area-inset-top))` 增加至更寬裕的 `calc(3.5rem + env(safe-area-inset-top))`，把卡片整體往下推，避免右上角叉叉緊貼頂端而難以按壓。
- **調大圖片 Lightbox 關閉按鈕的安全間距**：將三個大圖 Lightbox 的關閉按鈕定位由 `top: 16px, right: 16px` 調為 `top: calc(28px + env(safe-area-inset-top)), right: 20px`。這為手機使用者留出了極為舒適的單手按壓區，且能徹底繞開 Safari 頂部的原生動作列與 iPhone 瀏海遮擋，讓「關閉大圖」的叉叉按鈕清晰重現。
- **專案建置驗證**：成功跑通 `npx tsc --noEmit` 驗證。
## 2026-06-28 — 圖片 Lightbox 點擊圖片直接切換下一張功能

### 修改概述
- **新增大圖點擊切換功能 (Click/Tap to Switch Next Image)**：在主網頁 Lightbox 以及 `EditExpenseModal` 的兩個 Lightbox 中，為 `<img>` 標籤添加了 `onClick` 點擊處理函數，並調用 `e.stopPropagation()` 阻止點擊事件向外傳遞而關閉彈窗。當使用者點擊大圖本身時，會智慧切換到下一張（若只有一張圖則不切換，多張圖時滑鼠會變成 `pointer`），為行動裝置及桌面端提供極佳的相簿瀏覽流暢度。
- **專案建置驗證**：成功跑通 `npx tsc --noEmit` 驗證。

## 2026-06-28 — 解決目的地國家 JSON 髒資料導致外幣 Chip 無法顯示與切換的 Bug

### 修改概述
- **導出與全域套用 extractCleanCountries**：由於先前在「自訂每日目的地國家」改版中，我們將國家表以 JSON 結構包裝儲存在 Prisma 的 `countries` (PostgreSQL `String[]` 陣列的第一個元素中)。這導致在網頁端 **「快速記帳 (ExpenseForm)」** 與 **「編輯花費 (EditExpenseModal)」** 中，直接將其作為 raw string 傳給 `getCurrenciesFromCountries(countries)` 時解析失敗，進而造成網頁畫面上**完全沒有任何外幣 (如 EUR、JPY) 按鈕可以選，只剩下預設 TWD**。
- **修復內容**：
  1. 將 `src/lib/countries.ts` 中的 `extractCleanCountries` 導出為 `export`。
  2. 在 `src/app/trips/[tripId]/page.tsx` 中將其引入。
  3. 分別在 `ExpenseForm` 和 `EditExpenseModal` 的變數初始化中，使用 `extractCleanCountries` 將 `countries` 淨化解包，再丟給匯率/幣別 chip 生成器。
  4. 同時將彈窗與記帳 Form 中三處 `getCurrencyChipLabel` 呼叫 the `countries` 參數替換為 `cleanCountries`。這不僅讓多國行程對應的歐元 `EUR` 等外幣 Chip 秒現身（點選高亮），且在點擊儲存修改後能成功改寫資料庫，並使幣別標籤能正確帶出 `歐元 (奧地利)` 的精緻標籤！
- **專案建置驗證**：成功跑通 `npx tsc --noEmit` 驗證。

## 2026-06-28 — 行程主頁花費列表依日期分組優化

### 修改概述
- **重構花費列表為依日期分組 (Group By Date)**：在主頁面的全部花費卡片中，將單一的花費項目列表改為雙層嵌套。按消費日期 `yyyy/M/d` 進行分組顯示，最上方顯示最新的日期組，實現更加層次分明的清單排版。
- **日期 Header 與 Day X 標籤**：每個日期分組的頂部會繪製一條精緻的 Header，格式為 `yyyy/M/d (星期幾)`，並附有 Calendar 圖示。如果該日期屬於行程的區間，還會利用 `differenceInDays` 動態計算出 `Day X`（如 `Day 3`）並加上一個精美的淡藍色小徽章高亮標註。
- **精簡單筆時間顯示**：為了配合日期分組並釋放卡片空間，我們將每一個消費項目內部的時間顯示由原先擁擠的 `yyyy/M/d HH:mm` 精簡為只顯示小時與分鐘 `HH:mm`。這徹底解決了手機版上字體重疊與資訊過多顯得擁擠的痛點。
- **專案建置驗證**：成功跑通 `npx tsc --noEmit` 驗證。

## 2026-06-28 — 登入方式簡化：移除 LINE 登入，僅保留 Google 登入

### 修改概述
- **移除登入頁面的 LINE 登入功能**：在 `src/app/login/page.tsx` 中，徹底移去了 LINE 登入按鈕、分隔線以及底部的 LINE 綁定說明區塊。
- **僅保留 Google 登入**：登入頁面目前僅展示單一的 Google 登入按鈕，視覺上極為簡潔清爽，降低使用者在註冊與登入時的混淆度。
- **專案建置驗證**：成功跑通 `npx tsc --noEmit` 驗證。

## 2026-06-29 — 導覽列優化：移除 Navbar 中多餘的行程總覽與新增行程按鈕

### 修改概述
- **移除冗餘的導覽列連結**：在 `src/components/navbar.tsx` 中，移去了桌面版與手機展開版選單中對 `navItems` 的 map 渲染（即「✈️ 行程總覽」與「➕ 新增行程」兩個連結）。
- **極簡化 Navbar 設計**：這使頂部導覽列看起來更加極簡，避免了與首頁（行程總覽）中的現有功能重複，同時清除了未使用的 `navItems` 與 `isActive` 變數。
- **專案建置驗證**：成功跑通 `npx tsc --noEmit` 驗證。

## 2026-06-29 — 全站多語系 i18n 缺失審計與優化

### 修改概述
- **補充多語系翻譯字典**：在 `src/lib/i18n.ts` 的 `zh-TW` 與 `en` 中補充了缺失的接受邀請頁面、行程設定頁（成員管理、每日目的地國家）以及新增行程頁的每日目的地標題等中英文對照。
- **重構接受邀請頁面**：將 `src/app/invite/accept/page.tsx` 中所有寫死的中文提示、錯誤字串、載入文字以及按鈕以 `useLanguage` 的 `t()` 重新包裝，並使用 `interpolate` 帶入動態參數。
- **更新設定頁與新增行程頁**：
  - 將 `src/app/trips/[tripId]/settings/page.tsx` 中「每日目的地設定」與「成員管理」等標題、擁有者角色、移除按鈕改為多語系。
  - 將成員移除 confirm 提示框、成功與失敗 alert 修改為動態適配中英文。
  - 將 `src/app/trips/new/page.tsx` 中的「每日目的地國家設定」標題改為多語系。
- **專案建置驗證**：完美通過 `npx tsc --noEmit` 編譯檢測。

## 2026-06-29 — 國家名稱多語系與日期輸入框語系優化

### 修改概述
- **國家名稱多語系化**：在 `src/app/trips/new/page.tsx` 中的已選 Chip、下拉搜尋清單，以及 `settings/page.tsx` 和 `new/page.tsx` 底部的「每日目的地國家配置」中，皆改為根據語系動態顯示英/中文名（如 `country.nameEn`）。
- **日期輸入框 placeholder 優化**：
  - 將 `new/page.tsx` 與 `settings/page.tsx` 中的日期 `<input>` 改為動態 `type` 屬性（未選時為 `text`，獲得焦點或已有值時切換為 `date`）。
  - 這打破了中文瀏覽器在英文介面下硬性顯示中文「年/月/日」的缺陷，使其完美呈現 `Start Date` 與 `End Date` 或 `開始日期` 與 `結束日期` 的多語系 placeholder。
- **專案建置驗證**：成功跑通 `npx tsc --noEmit` 驗證。

## 2026-06-29 — 支出與收入合併顯示及統計優化

### 修改概述
- **支出與收入數據合流**：在 `src/app/trips/[tripId]/page.tsx` 中將 `trip.expenses` 與 `trip.deposits` 合併為統一的 `allTransactions` 陣列，並按交易時間進行排序，使「收入」記錄能以正確的日期 Day 分組顯示在歷史清單中。
- **交易行 (ExpenseRow) 渲染升級**：
  - 若為收入項目，顯示綠色的「💰 收入」徽章、金額加上 `+` 號前綴，並將金額標為綠色，提供極佳的辨識度。
  - 將收入項目的 `onEdit` 屬性設為 `undefined`，防止誤點開啟編輯面板。
- **統計 Modal 新增公積金餘額**：
  - 於花費統計 Modal 的底部加入對「總收入」的統計顯示，並自動結算並呈現「公積金餘額（總收入 - 總花費）」，對旅途公積金管理有重大提升。
- **專案建置驗證**：完美通過 `npx tsc --noEmit` 編譯檢測。

## 2026-06-29 — 行程主頁 SSR 秒開加速與記帳自訂日期優化

### 修改概述
- **行程主頁 Server Component 重構**：
  - 將 `src/app/trips/[tripId]/page.tsx` 移去 `"use client"`，重構為 Server Component。
  - 直接在後端使用 Prisma 拉取數據，並將 Date 物件序列化為 ISO String 以符合 Next.js 跨邊界傳遞的要求。
  - 成功消除客戶端二階段載入的白屏飛機 Loading，實現網頁「秒開」極速體驗。
- **引入客戶端容器**：
  - 建立 `src/app/trips/[tripId]/trip-detail-client.tsx` 承接原本的全部客戶端狀態與 UI，以 `initialData` 為初始值。
- **記帳自訂日期（支出與收入）**：
  - 更新 `deposits` 收入 API 以支援可選的 `date` 寫入（對應 `createdAt` 覆寫），零風險繞過 migration。
  - 於記帳表單 `ExpenseForm` 加上 `date` state（預設本地時間 yyyy-MM-ddTHH:mm 格式）。
  - 不論是支出還是收入分頁，在表單中皆渲染一個漂亮的 `<input type="datetime-local">` 日期時間欄位，並於提交時將自訂 ISO 時間傳給 API。
- **專案建置驗證**：完美通過 `npx tsc --noEmit` 編譯檢測。

## 2026-06-29 — 實作收入項目編輯與刪除功能

### 修改概述
- **新增單筆收入 API 路由**：
  - 建立 `src/app/api/trips/[tripId]/deposits/[depositId]/route.ts` API。
  - 實作 `PATCH` 請求以修改單筆收入的金額、幣種、備註與記帳時間（覆寫 `createdAt`）。
  - 實作 `DELETE` 請求以允許用戶從資料庫物理刪除特定收入數據。
- **前端支援編輯與刪除**：
  - 建立 `src/app/trips/[tripId]/trip-detail-client.tsx` 中的 `<EditDepositModal>` 元件，提供與支出類似的毛玻璃查看、修改與刪除介面。
  - 歷史清單行 `onEdit` 事件在使用者具備編輯權限且為收入項目時，導向開啟 `EditDepositModal`。
- **專案建置驗證**：成功跑通 `npx tsc --noEmit` 驗證。

## 2026-06-29 — 解決 Next.js 15+ 客戶端 fetch 快取不同步問題

### 修改概述
- **停用 API GET 快取**：
  - 修改 `src/app/trips/[tripId]/trip-detail-client.tsx` 中的 `fetchTrip` 數據刷新請求。
  - 將 URL 加上動態時間戳記 `?t=${Date.now()}`，並設定 fetch header `{ cache: 'no-store' }`。
  - 這強迫瀏覽器與 Next.js 網絡執行期完全略過快取、直接自後端資料庫取得最新帳目數據，從而根治了編輯/刪除花費或收入後，頁面資料不即時更新、必須手動重新整理網頁的問題。
- **專案建置驗證**：成功跑通 `npx tsc --noEmit` 驗證。

## 2026-06-29 — 實作圖片上傳與壓縮期間競態優化（修復圖片漏失 Bug）

### 修改概述
- **加入 compressing 鎖定機制**：
  - 於 `ExpenseForm` (新增支出) 及 `EditExpenseModal` (編輯支出) 元件中，新增 `compressing` 狀態，用以表示非同步的圖片壓縮任務是否正在執行。
  - 當點選圖片時，將 `compressing` 設為 `true`，防止使用者在照片讀取與 Canvas 壓縮期間提早提交表單，解決原先因為手速過快提交空圖片陣列的 Bug。
- **UI 優化與 Loading 指示**：
  - 當圖片正在處理時，新增圖片按鈕會被替換為精緻的 `Loader2` 轉圈狀態與「圖片處理中...」文字。
  - 「確認記帳」與「儲存修改」按鈕在壓縮期間會被設為 `disabled` 狀態，且文字切換為「圖片處理中...」，提供明確的反饋提示。
- **錯誤捕捉增強**：
  - 移除原先靜默忽略（`catch { /* ignore */ }`）的設計，當圖片讀取解碼或壓縮失敗時，會在控制台印出 error 並彈窗告知使用者，避免使用者因不知情而提交不完全的資料。
- **專案建置驗證**：成功跑通 `npx tsc --noEmit` 驗證。

## 2026-06-29 — 修復前端 parsedExpenses 對應遺漏 images 欄位 Bug

### 修改概述
- **補上 images 欄位映射**：
  - 修改 `src/app/trips/[tripId]/trip-detail-client.tsx` 中的 `parsedExpenses` 資料轉換函數。
  - 補上先前遺漏的 `images: e.images` 屬性映射。
  - 這解決了因為欄位遺漏導致從伺服器端獲取的 `images` 資料無法成功流向 `EditExpenseModal` 詳情視窗的 Bug，使所有原本已存入資料庫的支出附圖得以正常顯示與展開。
- **專案建置驗證**：成功跑通 `npx tsc --noEmit` 驗證。

## 2026-06-29 — 電腦版（大螢幕）彈窗尺寸與字體大小適配優化

### 修改概述
- **新增 CSS 媒體查詢**：
  - 於 `src/app/globals.css` 尾部，針對 `min-width: 768px` 的裝置（平板與電腦桌機版）新增彈窗覆寫樣式。
  - 將一般彈窗（詳情、編輯、分享邀請）的 `max-width` 調整至大器的 `550px`，並將統計圖表彈窗（`stats-modal`）擴大適配至 `800px`，使電腦版排版更加協調。
  - 全面性等比例放大電腦版彈窗內的字體（項目大標題、大金額、資訊欄目、輸入框與按鈕等），大幅提升長輩與桌機使用者的視覺舒適度與操作便利性。
- **重構前端 CSS 類別**：
  - 於 `trip-detail-client.tsx` 中，將 `EditExpenseModal`、`EditDepositModal`、`StatsModal` 以及分享邀請 Modal 的 `className` 改為標準的 `glass-card trip-modal`，以利 CSS 媒體查詢精確選取與渲染。
- **專案建置驗證**：成功跑通 `npx tsc --noEmit` 驗證。
