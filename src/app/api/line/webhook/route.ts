/**
 * LINE Messaging API Webhook
 * 處理 LINE 帳號連動、多行程 Carousel 切換、以及時間提示警示記帳功能
 */
import { NextRequest } from "next/server"
import { prisma } from "@/lib/prisma"
import crypto from "crypto"
import { convertExpenseAmount } from "@/lib/exchange-rate"

// LINE 回覆訊息的共用 Fetch 函數
async function replyMessage(replyToken: string, messages: any[]) {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN
  if (!token) {
    console.error("[LINE Webhook] 未設定 LINE_CHANNEL_ACCESS_TOKEN")
    return
  }

  // 安全防呆：如果 messages 中的 quickReply.items 為空，則將其刪除以防 LINE 400 報錯
  const sanitizedMessages = messages.map((msg) => {
    if (msg.quickReply && (!msg.quickReply.items || msg.quickReply.items.length === 0)) {
      const { quickReply, ...rest } = msg
      return rest
    }
    return msg
  })

  try {
    const res = await fetch("https://api.line.me/v2/bot/message/reply", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        replyToken,
        messages: sanitizedMessages,
      }),
    })

    if (!res.ok) {
      const errText = await res.text()
      console.error(`[LINE Webhook] 回覆失敗 HTTP ${res.status}:`, errText)
    }
  } catch (err) {
    console.error("[LINE Webhook] 回覆請求異常:", err)
  }
}

// 驗證 LINE 簽章
function verifySignature(body: string, signature: string, channelSecret: string): boolean {
  if (!signature || !channelSecret) return false
  const hash = crypto
    .createHmac("SHA256", channelSecret)
    .update(body)
    .digest("base64")
  return hash === signature
}

// 計算行程天數進度與警示訊息
function getTripDayInfo(startDateStr: string, endDateStr: string): {
  status: "planning" | "active" | "completed"
  message: string
  dayText: string
} {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  
  const start = new Date(startDateStr)
  const startDate = new Date(start.getFullYear(), start.getMonth(), start.getDate()).getTime()
  
  const end = new Date(endDateStr)
  const endDate = new Date(end.getFullYear(), end.getMonth(), end.getDate()).getTime()

  const oneDayMs = 24 * 60 * 60 * 1000

  const startFmt = startDateStr.split("T")[0].replace(/-/g, "/")
  const endFmt = endDateStr.split("T")[0].replace(/-/g, "/")

  if (today < startDate) {
    const diffDays = Math.ceil((startDate - today) / oneDayMs)
    return {
      status: "planning",
      dayText: "尚未開始",
      message: `⚠️ 提示：此行程將於 ${diffDays} 天後 (${startFmt}) 開始。`,
    }
  } else if (today > endDate) {
    const diffDays = Math.ceil((today - endDate) / oneDayMs)
    return {
      status: "completed",
      dayText: "已結束",
      message: `⚠️ 警告：此行程已於 ${diffDays} 天前 (${endFmt}) 結束。如果您要記錄新行程，請記得使用 /list 切換行程！`,
    }
  } else {
    const totalDays = Math.ceil((endDate - startDate) / oneDayMs) + 1
    const currentDay = Math.ceil((today - startDate) / oneDayMs) + 1
    return {
      status: "active",
      dayText: `Day ${currentDay}/${totalDays}`,
      message: `✨ 行程進行中：Day ${currentDay}/${totalDays}`,
    }
  }
}

let currentOrigin = "https://travel-expense-bot-steel.vercel.app"

export async function POST(req: NextRequest) {
  const origin = new URL(req.url).origin
  currentOrigin = origin

  const channelSecret = process.env.LINE_CHANNEL_SECRET || ""
  const signature = req.headers.get("x-line-signature") || ""

  try {
    const bodyText = await req.text()

    if (!verifySignature(bodyText, signature, channelSecret)) {
      console.warn("[LINE Webhook] 簽章驗證失敗")
      return new Response("Unauthorized", { status: 401 })
    }

    const payload = JSON.parse(bodyText)
    const events = payload.events || []

    for (const event of events) {
      if (event.type === "message") {
        if (event.message.type === "text") {
          await handleTextMessage(event)
        } else if (event.message.type === "image") {
          await handleImageMessage(event)
        }
      } else if (event.type === "postback") {
        await handlePostbackEvent(event)
      }
    }

    return new Response("OK", { status: 200 })
  } catch (error) {
    console.error("[LINE Webhook Error]", error)
    return new Response("Internal Server Error", { status: 500 })
  }
}

// 處理文字訊息
async function handleTextMessage(event: any) {
  const replyToken = event.replyToken
  const lineUserId = event.source.userId
  const text = event.message.text.trim()

  if (!lineUserId) return

  // 1. 查詢該 LINE 使用者在網頁端對應的 User 記錄
  const user = await prisma.user.findUnique({
    where: { lineUserId },
    include: { lineBotState: true },
  })

  // === 優先攔截對話欄位修改 (Stateless Edit Prompt) ===
  if (user) {
    const identifier = `edit-prompt:${user.id}`
    const editPrompt = await prisma.verificationToken.findFirst({
      where: {
        identifier,
        expires: { gt: new Date() },
      },
    })

    if (editPrompt) {
      // 刪除此臨時標記，避免重複攔截
      await prisma.verificationToken.delete({
        where: { id: editPrompt.id },
      })

      const parts = editPrompt.token.split(":")
      const field = parts[0]
      const expenseId = parts[1]

      await handleDirectTextUpdate(replyToken, expenseId, field, text)
      return
    }
  }

  // 2. 解析個人帳號綁定指令：/link 6位配對碼
  const linkMatch = text.match(/^\/link\s+(\d{6})$/i)
  if (linkMatch) {
    const token = linkMatch[1]
    await handleUserLinkCommand(replyToken, lineUserId, token)
    return
  }

  // 3. 處理行程清單與切換指令：/list 或 '切換' 或 '行程'
  if (text === "/list" || text === "切換" || text === "行程") {
    await handleListCommand(replyToken, user)
    return
  }

  // 4. 處理目前狀態查詢：/status 或 '目前'
  if (text === "/status" || text === "目前") {
    await handleStatusCommand(replyToken, user)
    return
  }

  // 4.1 處理幣別設定指令：/currency [幣別]
  const currencyMatch = text.match(/^\/currency(?:\s+([a-zA-Z]{3}))?$/i)
  if (currencyMatch) {
    const targetCurrency = currencyMatch[1] ? currencyMatch[1].toUpperCase() : null
    await handleCurrencyCommand(replyToken, user, targetCurrency)
    return
  }

  // 4.1a 處理更多幣別查詢：/currency_other
  if (text === "/currency_other") {
    await handleCurrencyOtherCommand(replyToken, user)
    return
  }

  // 4.2 處理目前花費查詢：/expenses 或 '目前花費' 或 '花費'
  if (text === "/expenses" || text === "目前花費" || text === "花費") {
    await handleExpensesCommand(replyToken, user)
    return
  }

  // 4.3 處理特定日期花費查詢：/expenses_date 2026-06-28
  const dateMatch = text.match(/^\/expenses_date\s+(\d{4}-\d{2}-\d{2})$/i)
  if (dateMatch) {
    const queryDateStr = dateMatch[1]
    await handleDateExpensesQuery(replyToken, user, queryDateStr)
    return
  }

  // 4.4 處理其他日期查詢：/expenses_other_dates
  if (text === "/expenses_other_dates") {
    await handleOtherDatesCommand(replyToken, user)
    return
  }

  // 5. 一般記帳流程
  if (!user) {
    await replyMessage(replyToken, [
      {
        type: "text",
        text: "⚠️ 您的 LINE 帳號尚未與「小銘子記帳」網站連結。\n\n請先在網頁端使用 Google 登入後，至「個人設定」或「行程設定」中連結 LINE 帳號取得 6 位配對碼，並在 LINE 傳送：\n/link [6位配對碼]\n\n即可完成個人帳號綁定！",
      },
    ])
    return
  }

  const activeTripState = user.lineBotState?.activeTripId // 例如 "trip-uuid-123:JPY" 或 "trip-uuid-123"
  let activeTripId = null
  let userActiveCurrency = null

  if (activeTripState) {
    if (activeTripState.includes(":")) {
      const parts = activeTripState.split(":")
      activeTripId = parts[0]
      userActiveCurrency = parts[1]
    } else {
      activeTripId = activeTripState
    }
  }

  if (!activeTripId) {
    await replyMessage(replyToken, [
      {
        type: "text",
        text: "💡 您目前尚未選定或綁定任何預設記帳行程。\n\n請直接輸入 `/list` 指令來列出並切換您的行程；或是前往網頁端點選一鍵設定！",
      },
    ])
    return
  }

  // 解析記帳語法 (品項 金額 幣別)
  const expenseMatch = text.match(/^(.+?)\s+(\d+(?:\.\d+)?)(?:\s+([a-zA-Z]{3}))?$/)
  if (!expenseMatch) {
    let quickReply = undefined
    try {
      const trip = await prisma.trip.findUnique({
        where: { id: activeTripId },
      })
      if (trip) {
        quickReply = await getQuickReply(trip, userActiveCurrency)
      }
    } catch (e) {}

    await replyMessage(replyToken, [
      {
        type: "text",
        text: "💡 LINE 快速記帳格式：\n[品項] [金額] [幣別(選填)]\n\n📝 範例：\n- 拉麵 1500 JPY\n- 捷運 35\n- 樂高 100 USD\n\n📌 常用指令：\n- `/status`：查詢目前連動行程\n- `/list`：列出行程並一鍵切換\n- 點選下方快速選單切換記帳幣別",
        quickReply,
      },
    ])
    return
  }

  const item = expenseMatch[1].trim()
  const amount = parseFloat(expenseMatch[2])
  let currency = (expenseMatch[3] || "").toUpperCase()

  try {
    const trip = await prisma.trip.findUnique({
      where: { id: activeTripId },
    })

    if (!trip) {
      await replyMessage(replyToken, [
        {
          type: "text",
          text: "⚠️ 找不到您目前綁定的行程，可能該行程已被刪除。請輸入 `/list` 重新選定行程。",
        },
      ])
      return
    }

    // 推斷幣別優先順序：1. LINE 當前選用幣別 -> 2. 行程預設幣別 -> 3. 台幣 TWD
    if (!currency) {
      currency = (userActiveCurrency || trip.defaultCurrency || "TWD").toUpperCase()
    }

    const category = getAutoCategory(item)
    const categoryNameMap: Record<string, string> = {
      food: "🍜 餐飲",
      transport: "🚃 交通",
      accommodation: "🛏️ 住宿",
      shopping: "🛍️ 購物",
      ticket: "🎫 門票",
      other: "📦 其他",
    }

    // 匯率換算
    const baseCurrency = trip.baseCurrency || "TWD"
    const conversion = await convertExpenseAmount(amount, currency, baseCurrency)
    const convertedAmount = conversion ? conversion.convertedAmount : amount
    const exchangeRate = conversion ? conversion.exchangeRate : 1.0

    // 寫入 Expense 資料庫
    await prisma.expense.create({
      data: {
        tripId: activeTripId,
        userId: user.id,
        category,
        item,
        amount,
        currency,
        convertedAmount,
        exchangeRate,
        source: "line",
      },
    })

    // 計算行程天數進度與警示
    const dayInfo = getTripDayInfo(trip.startDate.toISOString(), trip.endDate.toISOString())

    // 回覆成功訊息
    let replyText = `✅ 記帳成功！\n\n📌 項目：${item}\n💰 金額：${amount} ${currency}\n📂 分類：${categoryNameMap[category]}`
    if (currency !== baseCurrency) {
      replyText += `\n💱 換算：${convertedAmount} ${baseCurrency} (匯率 ${exchangeRate})`
    }
    
    // 加入行程時間提示與警示
    replyText += `\n\n✈️ 行程：${trip.name}\n📅 狀態：${dayInfo.dayText}`
    if (dayInfo.status !== "active") {
      replyText += `\n${dayInfo.message}`
    }

    await replyMessage(replyToken, [
      {
        type: "text",
        text: replyText,
        quickReply: await getQuickReply(trip, userActiveCurrency),
      },
    ])
  } catch (err: any) {
    console.error("[LINE Webhook Add Expense Error]", err)
    await replyMessage(replyToken, [
      {
        type: "text",
        text: `❌ 記帳失敗：${err.message || "未知伺服器錯誤"}`,
      },
    ])
  }
}

// 處理個人連動碼綁定 (/link 123456)
async function handleUserLinkCommand(replyToken: string, lineUserId: string, token: string) {
  try {
    const identifierPrefix = "line-link:"

    // 1. 在 VerificationToken 中尋找配對碼
    const linkToken = await prisma.verificationToken.findFirst({
      where: {
        token,
        identifier: {
          startsWith: identifierPrefix,
        },
        expires: {
          gt: new Date(),
        },
      },
    })

    if (!linkToken) {
      await replyMessage(replyToken, [
        {
          type: "text",
          text: "❌ 綁定失敗：連動配對碼無效或已過期 (限時 15 分鐘)。\n請在網頁端「行程設定」中重新產生連動碼後再試一次！",
        },
      ])
      return
    }

    // 2. 解析出網頁端的 userId
    const userId = linkToken.identifier.replace(identifierPrefix, "")

    // 3. 更新 User 紀錄
    await prisma.user.update({
      where: { id: userId },
      data: { lineUserId },
    })

    // 4. 清除配對碼
    await prisma.verificationToken.delete({
      where: { id: linkToken.id },
    })

    // 5. 尋找使用者名下的第一個行程，並預設綁定
    const firstMember = await prisma.tripMember.findFirst({
      where: { userId },
      include: { trip: true },
      orderBy: { joinedAt: "desc" },
    })

    let activeTripText = "\n\n💡 您目前名下沒有任何行程，請前往網頁端建立行程後，在 LINE 傳送 `/list` 來連動您的行程。"
    if (firstMember) {
      await prisma.lineBotState.upsert({
        where: { userId },
        update: { activeTripId: firstMember.tripId },
        create: { userId, activeTripId: firstMember.tripId },
      })
      activeTripText = `\n\n✈️ 系統已自動將您連動至最近的行程：\n【${firstMember.trip.name}】`
    }

    await replyMessage(replyToken, [
      {
        type: "text",
        text: `🎉 帳號連結成功！\n\n您的 LINE 帳號已順利與網頁端帳號連動。${activeTripText}\n\n📌 常用功能指令：\n- 直接輸入「品項 金額」即可記帳！\n- 傳送 /status 查詢目前鎖定的記帳行程。\n- 傳送 /list 可切換其他行程。`,
      },
    ])
  } catch (err: any) {
    console.error("[LINE User Link Command Error]", err)
    await replyMessage(replyToken, [
      {
        type: "text",
        text: `❌ 連動過程中發生錯誤：${err.message}`,
      },
    ])
  }
}

// 處理 /list 輸出行程輪播選單
async function handleListCommand(replyToken: string, user: any) {
  if (!user) {
    await replyMessage(replyToken, [
      {
        type: "text",
        text: "⚠️ 您的 LINE 尚未連結帳號！\n請至網頁端取得個人配對碼，並在 LINE 輸入：\n/link [6位配對碼]",
      },
    ])
    return
  }

  try {
    // 查詢使用者參與的所有行程
    const members = await prisma.tripMember.findMany({
      where: { userId: user.id },
      include: { trip: true },
      orderBy: { trip: { startDate: "desc" } },
    })

    if (members.length === 0) {
      await replyMessage(replyToken, [
        {
          type: "text",
          text: "💡 您目前尚未加入任何行程。請先至網頁端建立或加入一個旅行記帳行程！",
        },
      ])
      return
    }

    // LINE Carousel columns 陣列最多 10 個
    const activeTripId = user.lineBotState?.activeTripId
    const columns = members.slice(0, 10).map((m) => {
      const trip = m.trip
      const dayInfo = getTripDayInfo(trip.startDate.toISOString(), trip.endDate.toISOString())
      
      const startFmt = trip.startDate.toISOString().split("T")[0].replace(/-/g, "/")
      const endFmt = trip.endDate.toISOString().split("T")[0].replace(/-/g, "/")

      const title = trip.name.substring(0, 40)
      const currentActiveTripId = activeTripId?.includes(":") ? activeTripId.split(":")[0] : activeTripId
      const isReallyActive = trip.id === currentActiveTripId

      let description = `${startFmt} - ${endFmt}\n狀態: ${dayInfo.dayText}`
      if (isReallyActive) {
        description += ` (⭐ 目前行程)`
      }

      return {
        title,
        text: description.substring(0, 60),
        actions: [
          {
            type: "postback",
            label: isReallyActive ? "此為目前行程" : "設定為目前行程",
            data: `action=switch_trip&tripId=${trip.id}`,
            displayText: isReallyActive ? `此行程為目前記帳行程` : `將【${trip.name}】設定為目前行程`,
          },
        ],
      }
    })

    await replyMessage(replyToken, [
      {
        type: "template",
        altText: "您的行程列表，點擊即可切換 LINE 預設記帳行程",
        template: {
          type: "carousel",
          columns,
        },
      },
    ])
  } catch (err: any) {
    console.error("[LINE List Command Error]", err)
    await replyMessage(replyToken, [
      {
        type: "text",
        text: `❌ 查詢行程清單失敗：${err.message}`,
      },
    ])
  }
}

// 處理 /status 狀態查詢指令
async function handleStatusCommand(replyToken: string, user: any) {
  if (!user) {
    await replyMessage(replyToken, [
      {
        type: "text",
        text: "⚠️ 您的 LINE 尚未連結帳號！\n請至網頁端取得個人配對碼，並在 LINE 輸入：\n/link [6位配對碼]",
      },
    ])
    return
  }

  const activeTripState = user.lineBotState?.activeTripId
  let activeTripId = null
  let userActiveCurrency = null

  if (activeTripState) {
    if (activeTripState.includes(":")) {
      const parts = activeTripState.split(":")
      activeTripId = parts[0]
      userActiveCurrency = parts[1]
    } else {
      activeTripId = activeTripState
    }
  }

  if (!activeTripId) {
    await replyMessage(replyToken, [
      {
        type: "text",
        text: "💡 您目前尚未綁定任何記帳行程。\n請在 LINE 傳送 `/list` 來選擇並切換您要記帳的行程。",
      },
    ])
    return
  }

  try {
    const trip = await prisma.trip.findUnique({
      where: { id: activeTripId },
    })

    if (!trip) {
      await replyMessage(replyToken, [
        {
          type: "text",
          text: "⚠️ 找不到您目前預設的記帳行程，可能該行程已被刪除。請輸入 `/list` 重新選取行程。",
        },
      ])
      return
    }

    const dayInfo = getTripDayInfo(trip.startDate.toISOString(), trip.endDate.toISOString())
    const startFmt = trip.startDate.toISOString().split("T")[0].replace(/-/g, "/")
    const endFmt = trip.endDate.toISOString().split("T")[0].replace(/-/g, "/")

    const activeCurrencyCode = userActiveCurrency || trip.defaultCurrency || "TWD"
    const currencyName = ALL_CURRENCY_NAMES[activeCurrencyCode.toUpperCase()] || ""
    const currencyLabel = userActiveCurrency
      ? `${currencyName} (${activeCurrencyCode})`
      : `${currencyName} (${activeCurrencyCode}) [行程預設]`

    let replyText = `📌 目前預設 LINE 記帳行程：\n\n✈️【${trip.name}】\n📅 時間：${startFmt} - ${endFmt}\n🧭 狀態：${dayInfo.dayText}\n💱 LINE 預設幣別：${currencyLabel}`
    if (dayInfo.status !== "active") {
      replyText += `\n\n${dayInfo.message}`
    }

    replyText += `\n\n💡 提示：可以直接傳送「品項 金額」記帳；點選下方鍵盤上方按鈕，可快速切換該行程的目的地幣別！`

    await replyMessage(replyToken, [
      {
        type: "text",
        text: replyText,
        quickReply: await getQuickReply(trip, userActiveCurrency),
      },
    ])
  } catch (err: any) {
    console.error("[LINE Status Command Error]", err)
    await replyMessage(replyToken, [
      {
        type: "text",
        text: `❌ 查詢狀態失敗：${err.message}`,
      },
    ])
  }
}

// 處理 Postback 事件 (包含行程切換、圖片附加)
async function handlePostbackEvent(event: any) {
  const replyToken = event.replyToken
  const lineUserId = event.source.userId
  const data = event.postback.data

  if (!lineUserId || !data) return

  const params = new URLSearchParams(data)
  const action = params.get("action")

  if (action === "switch_trip") {
    const tripId = params.get("tripId")
    if (!tripId) return
    await handleSwitchTripPostback(replyToken, lineUserId, tripId)
  } else if (action === "attach_image") {
    const expenseId = params.get("expenseId")
    const msgId = params.get("msgId")
    if (!expenseId || !msgId) return
    await saveLineImageToExpense(replyToken, expenseId, msgId)
  } else if (action === "delete_expense") {
    const expenseId = params.get("expenseId")
    if (!expenseId) return
    await handleDeleteExpense(replyToken, expenseId)
  } else if (action === "edit_expense_menu") {
    const expenseId = params.get("expenseId")
    if (!expenseId) return
    await handleEditExpenseMenu(replyToken, expenseId)
  } else if (action === "edit_field") {
    const field = params.get("field")
    const expenseId = params.get("expenseId")
    if (!field || !expenseId) return
    await handleEditField(replyToken, lineUserId, field, expenseId)
  } else if (action === "update_field") {
    const field = params.get("field")
    const value = params.get("value")
    const expenseId = params.get("expenseId")
    if (!field || !value || !expenseId) return
    await handleUpdateField(replyToken, field, value, expenseId)
  }
}

// 處理 Postback 中的行程切換邏輯
async function handleSwitchTripPostback(replyToken: string, lineUserId: string, tripId: string) {

  try {
    // 1. 查詢使用者
    const user = await prisma.user.findUnique({
      where: { lineUserId },
    })

    if (!user) {
      await replyMessage(replyToken, [
        {
          type: "text",
          text: "⚠️ 帳號未連結，無法完成切換。",
        },
      ])
      return
    }

    // 2. 驗證是否為該行程成員
    const tripMember = await prisma.tripMember.findUnique({
      where: {
        tripId_userId: {
          tripId,
          userId: user.id,
        },
      },
      include: { trip: true },
    })

    if (!tripMember) {
      await replyMessage(replyToken, [
        {
          type: "text",
          text: "⚠️ 權限不足，您並非此行程的成員，無法設定為預設記帳行程。",
        },
      ])
      return
    }

    const trip = tripMember.trip

    // 3. 更新 LINE Bot 鎖定行程
    await prisma.lineBotState.upsert({
      where: { userId: user.id },
      update: { activeTripId: trip.id },
      create: {
        userId: user.id,
        activeTripId: trip.id,
      },
    })

    // 4. 計算行程狀態與天數
    const dayInfo = getTripDayInfo(trip.startDate.toISOString(), trip.endDate.toISOString())
    const startFmt = trip.startDate.toISOString().split("T")[0].replace(/-/g, "/")
    const endFmt = trip.endDate.toISOString().split("T")[0].replace(/-/g, "/")

    let replyText = `🎉 記帳行程切換成功！\n\n📌 目前預設：【${trip.name}】\n📅 時間：${startFmt} - ${endFmt}\n🧭 狀態：${dayInfo.dayText}`
    if (dayInfo.status !== "active") {
      replyText += `\n\n${dayInfo.message}`
    }

    await replyMessage(replyToken, [
      {
        type: "text",
        text: replyText,
      },
    ])
  } catch (err: any) {
    console.error("[LINE Postback Error]", err)
    await replyMessage(replyToken, [
      {
        type: "text",
        text: `❌ 切換行程失敗：${err.message}`,
      },
    ])
  }
}

// 根據品項名稱判斷花費分類
function getAutoCategory(item: string): string {
  const itemLower = item.toLowerCase()

  if (
    ["麵", "飯", "餐", "吃", "午餐", "晚餐", "早餐", "下午茶", "點心", "飲料", "咖啡", "水", "酒", "拉麵", "壽司", "燒肉", "牛排", "food", "eat", "drink", "coffee", "restaurant", "便當", "火鍋", "冰", "甜點", "宵夜"].some(
      (k) => itemLower.includes(k)
    )
  ) {
    return "food"
  }

  if (
    ["車", "捷運", "地鐵", "火車", "計程車", "ubike", "租車", "油", "機票", "公車", "巴士", "高鐵", "新幹線", "船", "悠遊卡", "suica", "icoca", "transport", "bus", "train", "flight", "taxi", "gas"].some(
      (k) => itemLower.includes(k)
    )
  ) {
    return "transport"
  }

  if (
    ["飯店", "民宿", "住", "房", "旅館", "青旅", "hotel", "hostel", "airbnb", "stay", "住宿"].some(
      (k) => itemLower.includes(k)
    )
  ) {
    return "accommodation"
  }

  if (
    ["買", "藥妝", "購物", "衣服", "紀念品", "伴手禮", "免稅", "outlet", "商場", "百貨", "shopping", "gift", "鞋", "包", "特產", "超市"].some(
      (k) => itemLower.includes(k)
    )
  ) {
    return "shopping"
  }

  if (
    ["門票", "票", "入場", "環球影城", "迪士尼", "樂園", "觀光", "博物館", "展覽", "ticket", "pass", "纜車", "體驗"].some(
      (k) => itemLower.includes(k)
    )
  ) {
    return "ticket"
  }

  return "other"
}

// 處理 LINE 圖片訊息
async function handleImageMessage(event: any) {
  const replyToken = event.replyToken
  const lineUserId = event.source.userId
  const messageId = event.message.id

  if (!lineUserId || !messageId) return

  // 1. 查詢使用者
  const user = await prisma.user.findUnique({
    where: { lineUserId },
  })

  if (!user) {
    await replyMessage(replyToken, [
      {
        type: "text",
        text: "⚠️ 您的 LINE 帳號尚未與「小銘子記帳」網站連結。\n\n請點選網頁右上角個人頭像選單，點選「連結 LINE 帳號」並取得 6 位配對碼，並在 LINE 傳送：\n/link [6位配對碼]\n\n即可完成個人帳號綁定！",
      },
    ])
    return
  }

  try {
    // 2. 查詢 10 分鐘內該使用者建立的所有花費
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000)
    const recentExpenses = await prisma.expense.findMany({
      where: {
        userId: user.id,
        createdAt: {
          gte: tenMinutesAgo,
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    })

    if (recentExpenses.length === 0) {
      // 情況 A：0 筆
      await replyMessage(replyToken, [
        {
          type: "text",
          text: "💡 找不到您最近 10 分鐘內的花費紀錄。\n\n請先傳送記帳文字（例如：`拉麵 1500 JPY`），隨後在 10 分鐘內傳送照片，即可自動為該花費添加圖片備註唷！",
        },
      ])
    } else if (recentExpenses.length === 1) {
      // 情況 B：剛好 1 筆
      const expense = recentExpenses[0]
      await saveLineImageToExpense(replyToken, expense.id, messageId)
    } else {
      // 情況 C：多於 1 筆
      // LINE Buttons Template 限制最多 4 個 actions
      const expensesToShow = recentExpenses.slice(0, 4)
      
      const actions = expensesToShow.map((exp) => {
        // LINE 按鈕文字限制 20 字以內，截斷品項避免報錯
        const label = `${exp.item} (${exp.amount} ${exp.currency})`.substring(0, 20)
        return {
          type: "postback",
          label,
          data: `action=attach_image&expenseId=${exp.id}&msgId=${messageId}`,
          displayText: `將照片附加至【${exp.item}】`,
        }
      })

      await replyMessage(replyToken, [
        {
          type: "template",
          altText: "有多筆最近的花費，請點擊按鈕選擇要附加的項目",
          template: {
            type: "buttons",
            title: "選擇附加花費項目",
            text: `偵測到您最近 10 分鐘內有多筆記帳，請點擊下方按鈕選擇這張照片要附加到哪一筆花費：`,
            actions,
          },
        },
      ])
    }
  } catch (err: any) {
    console.error("[LINE Image Message Handling Error]", err)
    await replyMessage(replyToken, [
      {
        type: "text",
        text: `❌ 處理圖片失敗：${err.message}`,
      },
    ])
  }
}

// 下載 LINE 圖片，轉換為 Base64 Data URL 並附加在對應 Expense 的 images 欄位中
async function saveLineImageToExpense(replyToken: string, expenseId: string, messageId: string) {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN
  if (!token) {
    await replyMessage(replyToken, [
      {
        type: "text",
        text: "❌ 伺服器端未配置 LINE_CHANNEL_ACCESS_TOKEN，無法下載圖片內容。",
      },
    ])
    return
  }

  try {
    // 1. 取得該筆花費
    const expense = await prisma.expense.findUnique({
      where: { id: expenseId },
    })

    if (!expense) {
      await replyMessage(replyToken, [
        {
          type: "text",
          text: "⚠️ 找不到對應的花費項目，該項目可能已被刪除。",
        },
      ])
      return
    }

    // 2. 檢查圖片數量上限 (最多 3 張)
    const currentImages = Array.isArray(expense.images) ? (expense.images as string[]) : []
    if (currentImages.length >= 3) {
      await replyMessage(replyToken, [
        {
          type: "text",
          text: `⚠️ 花費【${expense.item}】的圖片備註已達上限（最多 3 張），無法再加入更多圖片。`,
        },
      ])
      return
    }

    // 3. 呼叫 LINE API 下載圖片二進位內容
    const res = await fetch(`https://api-data.line.me/v2/bot/message/${messageId}/content`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })

    if (!res.ok) {
      const errText = await res.text()
      throw new Error(`無法從 LINE 下載圖片内容 HTTP ${res.status}: ${errText}`)
    }

    const arrayBuffer = await res.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)
    const base64Data = buffer.toString("base64")
    const dataUrl = `data:image/jpeg;base64,${base64Data}`

    // 4. 更新 Expense 資料庫
    const updatedImages = [...currentImages, dataUrl]
    await prisma.expense.update({
      where: { id: expenseId },
      data: {
        images: updatedImages,
      },
    })

    await replyMessage(replyToken, [
      {
        type: "text",
        text: `📸 照片已成功附加至花費【${expense.item} ${expense.amount} ${expense.currency}】！（第 ${updatedImages.length}/3 張）`,
      },
    ])
  } catch (err: any) {
    console.error("[saveLineImageToExpense Error]", err)
    await replyMessage(replyToken, [
      {
        type: "text",
        text: `❌ 下載或附加圖片失敗：${err.message}`,
      },
    ])
  }
}

// ==========================================
// 幣別切換與國家對應相關常數與函數
// ==========================================

// 國家代碼與貨幣中文對照表
const COUNTRY_CURRENCY_MAP: Record<string, { currency: string; name: string }> = {
  TW: { currency: "TWD", name: "台幣" },
  JP: { currency: "JPY", name: "日圓" },
  US: { currency: "USD", name: "美金" },
  AT: { currency: "EUR", name: "歐元" }, // 奧地利
  DE: { currency: "EUR", name: "歐元" }, // 德國
  FR: { currency: "EUR", name: "歐元" }, // 法國
  IT: { currency: "EUR", name: "歐元" }, // 義大利
  ES: { currency: "EUR", name: "歐元" }, // 西班牙
  NL: { currency: "EUR", name: "歐元" }, // 荷蘭
  PT: { currency: "EUR", name: "歐元" }, // 葡萄牙
  GR: { currency: "EUR", name: "歐元" }, // 希臘
  FI: { currency: "EUR", name: "歐元" }, // 芬蘭
  CZ: { currency: "CZK", name: "克朗" }, // 捷克
  HU: { currency: "HUF", name: "福林" }, // 匈牙利
  PL: { currency: "PLN", name: "茲羅提" }, // 波蘭
  CH: { currency: "CHF", name: "法郎" }, // 瑞士
  GB: { currency: "GBP", name: "英鎊" }, // 英國
  SE: { currency: "SEK", name: "克朗" }, // 瑞典
  NO: { currency: "NOK", name: "克朗" }, // 挪威
  DK: { currency: "DKK", name: "克朗" }, // 丹麥
  IS: { currency: "ISK", name: "克朗" }, // 冰島
  HR: { currency: "EUR", name: "歐元" }, // 克羅埃西亞
  TR: { currency: "TRY", name: "里拉" }, // 土耳其
  KR: { currency: "KRW", name: "韓元" }, // 韓國
  CN: { currency: "CNY", name: "人民幣" },
  HK: { currency: "HKD", name: "港幣" },
  MO: { currency: "MOP", name: "澳門幣" },
  TH: { currency: "THB", name: "泰銖" },
  VN: { currency: "VND", name: "越南盾" },
  SG: { currency: "SGD", name: "新幣" },
  MY: { currency: "MYR", name: "馬幣" },
  PH: { currency: "PHP", name: "披索" },
  ID: { currency: "IDR", name: "印尼盾" },
  AU: { currency: "AUD", name: "澳幣" },
  NZ: { currency: "NZD", name: "紐幣" },
  CA: { currency: "CAD", name: "加幣" },
}

const COMMON_CURRENCIES = [
  { currency: "TWD", name: "台幣" },
  { currency: "JPY", name: "日圓" },
  { currency: "USD", name: "美金" },
  { currency: "EUR", name: "歐元" },
]

const ALL_CURRENCY_NAMES: Record<string, string> = {
  TWD: "台幣",
  JPY: "日圓",
  USD: "美金",
  EUR: "歐元",
  CZK: "克朗",
  HUF: "福林",
  PLN: "茲羅提",
  CHF: "法郎",
  GBP: "英鎊",
  SEK: "克朗",
  NOK: "克朗",
  DKK: "克朗",
  ISK: "克朗",
  TRY: "里拉",
  KRW: "韓元",
  CNY: "人民幣",
  HKD: "港幣",
  MOP: "澳門幣",
  THB: "泰銖",
  VND: "越南盾",
  SGD: "新幣",
  MYR: "馬幣",
  PHP: "披索",
  IDR: "印尼盾",
  AUD: "澳幣",
  NZD: "紐幣",
  CAD: "加幣",
}

// 根據行程目的地和常用幣別，動態生成 LINE Quick Reply 項目
async function getQuickReply(trip: any, userActiveCurrency: string | null) {
  const currencies: { currency: string; name: string }[] = []

  // 1. 加入行程基準幣別 (偏好貨幣)
  const baseCurrency = trip.baseCurrency || "TWD"
  const baseCurrencyChinese = ALL_CURRENCY_NAMES[baseCurrency.toUpperCase()] || baseCurrency
  currencies.push({ currency: baseCurrency.toUpperCase(), name: baseCurrencyChinese })

  // 2. 抓取目的地國家對應幣別
  const { list: tripCountries } = parseTripCountries(trip.countries, 1, 1)
  for (const c of tripCountries) {
    const match = COUNTRY_CURRENCY_MAP[c.toUpperCase()]
    if (match) {
      currencies.push(match)
    }
  }

  // 3. 排除重複的幣別
  const uniqueCurrencies: { currency: string; name: string }[] = []
  const seen = new Set<string>()

  for (const item of currencies) {
    if (!seen.has(item.currency)) {
      seen.add(item.currency)
      uniqueCurrencies.push(item)
    }
  }

  // 4. 將當前正在使用的幣別移到最前面
  const activeCurrencyCode = userActiveCurrency || trip.defaultCurrency || baseCurrency
  if (!seen.has(activeCurrencyCode.toUpperCase())) {
    const activeChinese = ALL_CURRENCY_NAMES[activeCurrencyCode.toUpperCase()] || activeCurrencyCode
    uniqueCurrencies.unshift({ currency: activeCurrencyCode.toUpperCase(), name: activeChinese })
  } else {
    const activeIndex = uniqueCurrencies.findIndex(c => c.currency === activeCurrencyCode)
    if (activeIndex > -1) {
      const [activeItem] = uniqueCurrencies.splice(activeIndex, 1)
      uniqueCurrencies.unshift(activeItem)
    }
  }

  // 5. 限制最多 11 個 (加上 "其他" 後最多 12 個，LINE 限制單次 13 個內)
  const finalCurrencies = uniqueCurrencies.slice(0, 11)

  // 6. 轉為 LINE Quick Reply 格式
  const items = finalCurrencies.map((c) => {
    const isActive = c.currency === activeCurrencyCode
    return {
      type: "action",
      action: {
        type: "message",
        // 選單顯示中文與英文，如 "⭐ 日圓 JPY"
        label: `${isActive ? "⭐ " : ""}${c.name} ${c.currency}`,
        text: `/currency ${c.currency}`,
      },
    }
  })

  // 7. 加入 "其他" 按鈕
  items.push({
    type: "action",
    action: {
      type: "message",
      label: "🔍 其他",
      text: "/currency_other",
    },
  })

  return { items }
}

// 額外常見幣別對照 (包含主流但可能沒在行程中出現的貨幣)
const ALTERNATIVE_CURRENCIES = [
  { currency: "JPY", name: "日圓" },
  { currency: "EUR", name: "歐元" },
  { currency: "USD", name: "美金" },
  { currency: "KRW", name: "韓元" },
  { currency: "THB", name: "泰銖" },
  { currency: "CNY", name: "人民幣" },
  { currency: "GBP", name: "英鎊" },
  { currency: "CAD", name: "加幣" },
  { currency: "AUD", name: "澳幣" },
  { currency: "SGD", name: "新加坡幣" },
  { currency: "MYR", name: "馬來西亞幣" },
]

// 獲取更多幣別的快速選單 (動態過濾已在常用選單出現的幣別，防止重複)
async function getOtherQuickReply(trip: any, userActiveCurrency: string | null) {
  const activeCurrencyCode = userActiveCurrency || trip.defaultCurrency || trip.baseCurrency || "TWD"
  
  // 1. 收集已在第一頁顯示的幣別
  const firstPageCurrencies = new Set<string>()
  const baseCurrency = trip.baseCurrency || "TWD"
  firstPageCurrencies.add(baseCurrency.toUpperCase())
  firstPageCurrencies.add(activeCurrencyCode.toUpperCase())
  
  const { list: tripCountries } = parseTripCountries(trip.countries, 1, 1)
  for (const c of tripCountries) {
    const match = COUNTRY_CURRENCY_MAP[c.toUpperCase()]
    if (match) {
      firstPageCurrencies.add(match.currency.toUpperCase())
    }
  }

  // 2. 過濾第二頁的 ALTERNATIVE_CURRENCIES
  const filteredAlts = ALTERNATIVE_CURRENCIES.filter(
    (c) => !firstPageCurrencies.has(c.currency.toUpperCase())
  )

  const items = filteredAlts.map((c) => {
    const isActive = c.currency === activeCurrencyCode
    return {
      type: "action",
      action: {
        type: "message",
        label: `${isActive ? "⭐ " : ""}${c.name} ${c.currency}`,
        text: `/currency ${c.currency}`,
      },
    }
  })

  // 加入返回常用按鈕
  items.push({
    type: "action",
    action: {
      type: "message",
      label: "🔙 返回常用",
      text: "/currency",
    },
  })

  return { items }
}

// 處理點選「其他」顯示更多常見幣別的指令
async function handleCurrencyOtherCommand(replyToken: string, user: any) {
  if (!user) return

  const activeTripState = user.lineBotState?.activeTripId
  let activeTripId = null
  let userActiveCurrency = null

  if (activeTripState) {
    if (activeTripState.includes(":")) {
      const parts = activeTripState.split(":")
      activeTripId = parts[0]
      userActiveCurrency = parts[1]
    } else {
      activeTripId = activeTripState
    }
  }

  if (!activeTripId) return

  try {
    const trip = await prisma.trip.findUnique({
      where: { id: activeTripId },
    })
    if (!trip) return

    await replyMessage(replyToken, [
      {
        type: "text",
        text: "💱 更多常見幣別選單\n\n請直接點選下方按鈕切換，帶有 ⭐ 即代表目前鎖定的幣別。\n\n💡 若選單中依然沒有您需要的幣別，您也可以直接手動輸入指令來設定（例如：輸入 /currency GBP 即可設定為英鎊）！",
        quickReply: await getOtherQuickReply(trip, userActiveCurrency),
      },
    ])
  } catch (err: any) {
    console.error("[handleCurrencyOtherCommand Error]", err)
  }
}

// 處理 /currency 指令
async function handleCurrencyCommand(replyToken: string, user: any, targetCurrency: string | null) {
  if (!user) {
    await replyMessage(replyToken, [
      {
        type: "text",
        text: "⚠️ 您的 LINE 尚未連結帳號！\n請至網頁端取得個人配對碼，並在 LINE 輸入：\n/link [6位配對碼]",
      },
    ])
    return
  }

  const activeTripState = user.lineBotState?.activeTripId
  let activeTripId = null
  let userActiveCurrency = null

  if (activeTripState) {
    if (activeTripState.includes(":")) {
      const parts = activeTripState.split(":")
      activeTripId = parts[0]
      userActiveCurrency = parts[1]
    } else {
      activeTripId = activeTripState
    }
  }

  if (!activeTripId) {
    await replyMessage(replyToken, [
      {
        type: "text",
        text: "💡 您目前尚未綁定任何記帳行程。\n請在 LINE 傳送 `/list` 來選擇並切換您要記帳的行程。",
      },
    ])
    return
  }

  try {
    const trip = await prisma.trip.findUnique({
      where: { id: activeTripId },
    })

    if (!trip) {
      await replyMessage(replyToken, [
        {
          type: "text",
          text: "⚠️ 找不到您目前綁定的行程，可能該行程已被刪除。請輸入 `/list` 重新選定行程。",
        },
      ])
      return
    }

    if (!targetCurrency) {
      // 沒帶參數，提示如何手動輸入切換，並一樣附上 Quick Reply
      const currencyList = trip.countries
        .map((c: string) => {
          const match = COUNTRY_CURRENCY_MAP[c.toUpperCase()]
          return match ? `${match.name} (${match.currency})` : null
        })
        .filter(Boolean)
        .join("、")

      let instruction = `💡 想要手動切換其他幣別？\n請直接輸入：\n/currency [三碼幣別] (不限大小寫)\n\n📝 範例：\n- /currency GBP (切換為英鎊)\n- /currency HKD (切換為港幣)\n\n🎯 亦可直接點選下方快速選單進行切換，帶有 ⭐ 的按鈕即代表目前的記帳幣別唷！`
      if (currencyList) {
        instruction += `\n\n📌 此行程目的地幣別：${currencyList}`
      }

      await replyMessage(replyToken, [
        {
          type: "text",
          text: instruction,
          quickReply: await getQuickReply(trip, userActiveCurrency),
        },
      ])
      return
    }

    // 儲存新幣別設定到 activeTripId 狀態中 (格式 tripId:currency)
    const newTripState = `${activeTripId}:${targetCurrency}`
    await prisma.lineBotState.upsert({
      where: { userId: user.id },
      update: { activeTripId: newTripState },
      create: { userId: user.id, activeTripId: newTripState },
    })

    const currencyChinese = ALL_CURRENCY_NAMES[targetCurrency] || ""
    const displayName = currencyChinese ? `${currencyChinese} (${targetCurrency})` : targetCurrency

    await replyMessage(replyToken, [
      {
        type: "text",
        text: `💱 幣別切換成功！\n\n您在 LINE 的預設記帳幣別已鎖定為 ${displayName}。\n\n接下來您直接傳送金額（例如：拉麵 1500），將會自動記為 ${targetCurrency} 唷！`,
        quickReply: await getQuickReply(trip, targetCurrency),
      },
    ])
  } catch (err: any) {
    console.error("[LINE Currency Command Error]", err)
    await replyMessage(replyToken, [
      {
        type: "text",
        text: `❌ 切換幣別失敗：${err.message}`,
      },
    ])
  }
}

// ==========================================
// 行程花費管理、對話式編輯與刪除互動模組
// ==========================================

// 國家風景照 Unsplash 靜態對照表
// 國家風景照 Unsplash 靜態對照表
const COUNTRY_SCENERY_MAP: Record<string, string> = {
  TW: "https://images.unsplash.com/photo-1504829857797-ddff29c27927?w=800&q=80", // 台灣
  JP: "https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e?w=800&q=80", // 日本
  KR: "https://images.unsplash.com/photo-1534274988757-a28bf1a57c17?w=800&q=80", // 韓國
  AT: "https://images.unsplash.com/photo-1516550893923-42d28e5677af?w=800&q=80", // 奧地利
  DE: "https://images.unsplash.com/photo-1467269204594-9661b134dd2b?w=800&q=80", // 德國
  FR: "https://images.unsplash.com/photo-1502602898657-3e91760cbb34?w=800&q=80", // 法國
  IT: "https://images.unsplash.com/photo-1523906834658-6e24ef2386f9?w=800&q=80", // 義大利
  ES: "https://images.unsplash.com/photo-1543783207-ec64e4d95325?w=800&q=80", // 西班牙
  NL: "https://images.unsplash.com/photo-1534351590666-13e3e96b5017?w=800&q=80", // 荷蘭
  PT: "https://images.unsplash.com/photo-1555881400-74d7acaacd8b?w=800&q=80", // 葡萄牙
  GR: "https://images.unsplash.com/photo-1533105079780-92b9be482077?w=800&q=80", // 希臘
  FI: "https://images.unsplash.com/photo-1538332576228-eb5b4c4de6f5?w=800&q=80", // 芬蘭
  CZ: "https://images.unsplash.com/photo-1519677100203-a0e668c92439?w=800&q=80", // 捷克
  HU: "https://images.unsplash.com/photo-1551867633-194f125bddfa?w=800&q=80", // 匈牙利
  PL: "https://images.unsplash.com/photo-1519197924294-4ba991a11128?w=800&q=80", // 波蘭
  CH: "https://images.unsplash.com/photo-1530122037265-a5f1f91d3b99?w=800&q=80", // 瑞士
  GB: "https://images.unsplash.com/photo-1513635269975-59663e0ac1ad?w=800&q=80", // 英國
  SE: "https://images.unsplash.com/photo-1509356843151-3e7d96241e11?w=800&q=80", // 瑞典
  NO: "https://images.unsplash.com/photo-1531366936337-7c912a4589a7?w=800&q=80", // 挪威
  DK: "https://images.unsplash.com/photo-1513622470522-26c3c8a854bc?w=800&q=80", // 丹麥
  IS: "https://images.unsplash.com/photo-1504829857797-ddff29c27927?w=800&q=80", // 冰島
  HR: "https://images.unsplash.com/photo-1555990538-1e15faca6782?w=800&q=80", // 克羅埃西亞
  TR: "https://images.unsplash.com/photo-1524231757912-21f4fe3a7200?w=800&q=80", // 土耳其
  CN: "https://images.unsplash.com/photo-1547981609-4b6bfe67ca0b?w=800&q=80", // 中國
  HK: "https://images.unsplash.com/photo-1536599018102-9f803c140fc1?w=800&q=80", // 香港
  MO: "https://images.unsplash.com/photo-1552912867-69c07ba0e9a8?w=800&q=80", // 澳門
  TH: "https://images.unsplash.com/photo-1528181304800-259b08848526?w=800&q=80", // 泰國
  VN: "https://images.unsplash.com/photo-1557750255-c76072a7aad1?w=800&q=80", // 越南
  SG: "https://images.unsplash.com/photo-1525625293386-3f8f99389edd?w=800&q=80", // 新加坡
  MY: "https://images.unsplash.com/photo-1596422846543-75c6fc197f07?w=800&q=80", // 馬來西亞
  PH: "https://images.unsplash.com/photo-1518509562904-e7ef99cdcc86?w=800&q=80", // 菲律賓
  AU: "https://images.unsplash.com/photo-1506973035872-a4ec16b8e8d9?w=800&q=80", // 澳洲
  NZ: "https://images.unsplash.com/photo-1469521669194-babb45599def?w=800&q=80", // 紐西蘭
  CA: "https://images.unsplash.com/photo-1517935706615-2717063c2225?w=800&q=80", // 加拿大
}

// 消費類別專屬預設精美圖片對照表
const CATEGORY_IMAGE_MAP: Record<string, string> = {
  food: "https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=800&q=80",          // 餐飲美食
  transport: "https://images.unsplash.com/photo-1436491865332-7a61a109cc05?w=800&q=80",     // 交通 (飛機與雲海)
  accommodation: "https://images.unsplash.com/photo-1618773928121-c32242e63f39?w=800&q=80", // 住宿飯店
  shopping: "https://images.unsplash.com/photo-1483985988355-763728e1935b?w=800&q=80",      // 購物血拼
  ticket: "https://images.unsplash.com/photo-1460627390041-532a28402358?w=800&q=80",        // 景點票券與古堡
}

// 國家與時區偏移量 (UTC+) 對照表
const COUNTRY_TIMEZONE_MAP: Record<string, number> = {
  TW: 8, // 台灣 UTC+8
  JP: 9, // 日本 UTC+9
  KR: 9, // 韓國 UTC+9
  AT: 2, // 奧地利 UTC+2 (夏令)
  DE: 2, // 德國 UTC+2
  FR: 2, // 法國 UTC+2
  IT: 2, // 義大利 UTC+2
  ES: 2, // 西班牙 UTC+2
  NL: 2, // 荷蘭 UTC+2
  PT: 1, // 葡萄牙 UTC+1
  GR: 3, // 希臘 UTC+3
  CZ: 2, // 捷克 UTC+2
  HU: 2, // 匈牙利 UTC+2
  PL: 2, // 波蘭 UTC+2
  CH: 2, // 瑞士 UTC+2
  GB: 1, // 英國 UTC+1
  SE: 2, // 瑞典 UTC+2
  NO: 2, // 挪威 UTC+2
  DK: 2, // 丹麥 UTC+2
  IS: 0, // 冰島 UTC+0
  HR: 2, // 克羅埃西亞 UTC+2
  TR: 3, // 土耳其 UTC+3
  CN: 8, // 中國 UTC+8
  HK: 8, // 香港 UTC+8
  MO: 8, // 澳門 UTC+8
  TH: 7, // 泰國 UTC+7
  VN: 7, // 越南 UTC+7
  SG: 8, // 新加坡 UTC+8
  MY: 8, // 馬來西亞 UTC+8
  PH: 8, // 菲律賓 UTC+8
  ID: 7, // 印尼 UTC+7
  AU: 10, // 澳洲雪梨 UTC+10
  NZ: 12, // 紐西蘭 UTC+12
  CA: -4, // 加拿大東部 UTC-4
}

// 智慧解析行程目的地國家與特定當天所屬國家 (支援物件/陣列等新舊格式相容)
function parseTripCountries(countriesInput: string[] | null | undefined, currentDay: number, totalDays: number): { list: string[], active: string } {
  try {
    if (!countriesInput || countriesInput.length === 0) {
      return { list: [], active: "TW" }
    }

    // 支援物件格式: {"list": ["AT", "CZ"], "daily": ["AT", "AT", "CZ"]} 封裝在單一元素的陣列中
    if (countriesInput.length === 1 && countriesInput[0].startsWith("{")) {
      const parsed = JSON.parse(countriesInput[0])
      if (parsed && typeof parsed === "object") {
        const list = parsed.list || []
        let active = list[0] || "TW"
        if (parsed.daily && Array.isArray(parsed.daily)) {
          const dayIdx = currentDay - 1
          if (dayIdx >= 0 && dayIdx < parsed.daily.length) {
            active = parsed.daily[dayIdx]
          } else {
            active = parsed.daily[parsed.daily.length - 1] || active
          }
        }
        return { list, active }
      }
    }

    // 支援舊有陣列格式: ["AT", "CZ", "HU"]
    const list = countriesInput
    let active = "TW"
    if (list.length === 1) {
      active = list[0]
    } else if (list.length > 1) {
      const interval = totalDays / list.length
      const countryIndex = Math.min(
        Math.floor((currentDay - 1) / interval),
        list.length - 1
      )
      active = list[countryIndex]
    }
    return { list, active }
  } catch (err) {
    return { list: countriesInput || [], active: "TW" }
  }
}

// 智慧判定行程時區偏移：如果所有目的地國家皆為同一個時區，則統一使用該時區，避免天數分配偏差
function getTripTimezoneOffset(trip: any, activeCountry: string): number {
  try {
    const { list } = parseTripCountries(trip?.countries, 1, 1)
    if (list && list.length > 0) {
      const offsets = list
        .map(c => COUNTRY_TIMEZONE_MAP[c.toUpperCase()])
        .filter((offset): offset is number => offset !== undefined)
      
      const uniqueOffsets = Array.from(new Set(offsets))
      if (uniqueOffsets.length === 1) {
        return uniqueOffsets[0]
      }
    }
  } catch (err) {
    // 忽略錯誤，Fallback
  }
  return COUNTRY_TIMEZONE_MAP[activeCountry.toUpperCase()] ?? 8
}

// 根據記帳紀錄，動態生成行程日期 Quick Reply 項目 (考慮行程目的地當地時區)
async function getExpensesDatesQuickReply(activeTripId: string, userId: string, trip: any) {
  try {
    // 1. 取得行程目的地時區偏移量 (預設台北 UTC+8，若無跨時區則統一時區)
    let activeCountry = "TW"
    try {
      const { active } = parseTripCountries(trip?.countries, 1, 1)
      activeCountry = active
    } catch (e) {}
    const tzOffsetHours = getTripTimezoneOffset(trip, activeCountry)

    // 2. 查詢該行程下該使用者有記帳的日期
    const expenses = await prisma.expense.findMany({
      where: { tripId: activeTripId, userId },
      select: { date: true },
      orderBy: { date: "asc" }
    })

    // 3. 轉為當地時區的唯一日期字串 (YYYY-MM-DD)
    const uniqueDateStrs: string[] = []
    const seenDates = new Set<string>()

    expenses.forEach((e) => {
      if (e.date) {
        try {
          // 將 UTC Date 加上目的地時區偏移
          const localTime = new Date(e.date.getTime() + tzOffsetHours * 60 * 60 * 1000)
          const dStr = localTime.toISOString().split("T")[0]
          if (!seenDates.has(dStr)) {
            seenDates.add(dStr)
            uniqueDateStrs.push(dStr)
          }
        } catch (err) {
          // 忽略單筆異常
        }
      }
    })

    // 4. 確保「目的地當天的今天」也有在列表裡 (方便隨時查看今天)
    let todayStr = ""
    try {
      const localToday = new Date(Date.now() + tzOffsetHours * 60 * 60 * 1000)
      todayStr = localToday.toISOString().split("T")[0]
      if (!uniqueDateStrs.includes(todayStr)) {
        uniqueDateStrs.push(todayStr)
      }
    } catch (e) {
      // 忽略異常
    }

    // 5. 排序日期 (升序：舊到新)
    uniqueDateStrs.sort()

    // 6. 如果還是沒有任何日期，則 fallback 為行程的前 11 天
    if (uniqueDateStrs.length === 0 && trip) {
      try {
        const start = trip.startDate ? new Date(trip.startDate) : new Date()
        const end = trip.endDate ? new Date(trip.endDate) : new Date()
        const totalDays = Math.min(
          Math.ceil((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)) + 1,
          11
        )
        if (totalDays > 0) {
          for (let i = 0; i < totalDays; i++) {
            const d = new Date(start.getTime() + i * 24 * 60 * 60 * 1000)
            uniqueDateStrs.push(d.toISOString().split("T")[0])
          }
        }
      } catch (e) {
        // 忽略異常
      }
    }

    // 7. 若仍空，以今天兜底
    if (uniqueDateStrs.length === 0 && todayStr) {
      uniqueDateStrs.push(todayStr)
    }

    const weekDays = ["週日", "週一", "週二", "週三", "週四", "週五", "週六"]
    const items = uniqueDateStrs.slice(0, 11).map((dateStr) => {
      try {
        const d = new Date(dateStr)
        const month = d.getMonth() + 1
        const date = d.getDate()
        const dayName = weekDays[d.getDay()]
        return {
          type: "action",
          action: {
            type: "message",
            label: `${month}/${date} ${dayName}`,
            text: `/expenses_date ${dateStr}`,
          }
        }
      } catch (err) {
        return {
          type: "action",
          action: {
            type: "message",
            label: dateStr,
            text: `/expenses_date ${dateStr}`,
          }
        }
      }
    }).filter(Boolean)

    if (uniqueDateStrs.length > 11) {
      items.push({
        type: "action",
        action: {
          type: "message",
          label: "🔍 其他日期",
          text: `/expenses_other_dates`,
        }
      })
    }

    return { items }
  } catch (err) {
    console.error("[getExpensesDatesQuickReply Error]", err)
    const todayStr = new Date().toISOString().split("T")[0]
    return {
      items: [
        {
          type: "action",
          action: {
            type: "message",
            label: "今天",
            text: `/expenses_date ${todayStr}`,
          }
        }
      ]
    }
  }
}

// 處理 /expenses 查詢，輸出當前行程的所有日期 Quick Reply
async function handleExpensesCommand(replyToken: string, user: any) {
  if (!user) {
    await replyMessage(replyToken, [
      {
        type: "text",
        text: "⚠️ 您的 LINE 尚未連結帳號！\n請至網頁端取得個人配對碼，並在 LINE 輸入：\n/link [6位配對碼]",
      },
    ])
    return
  }

  const activeTripState = user.lineBotState?.activeTripId
  let activeTripId = null

  if (activeTripState) {
    activeTripId = activeTripState.includes(":") ? activeTripState.split(":")[0] : activeTripState
  }

  if (!activeTripId) {
    await replyMessage(replyToken, [
      {
        type: "text",
        text: "💡 您目前尚未選定或設定目前記帳行程。\n請在 LINE 傳送 `/list` 來選擇您目前的旅遊行程唷！",
      },
    ])
    return
  }

  try {
    const trip = await prisma.trip.findUnique({
      where: { id: activeTripId },
    })

    if (!trip) {
      await replyMessage(replyToken, [
        {
          type: "text",
          text: "⚠️ 找不到您目前預設的記帳行程，可能該行程已被刪除。請輸入 `/list` 重新選取行程。",
        },
      ])
      return
    }

    const quickReply = await getExpensesDatesQuickReply(activeTripId, user.id, trip)

    await replyMessage(replyToken, [
      {
        type: "text",
        text: `📅 請點選下方按鈕，選擇您想要查看花費的日期：\n（目前行程：【${trip.name}】）`,
        quickReply,
      },
    ])
  } catch (err: any) {
    console.error("[LINE Expenses Command Error]", err)
    await replyMessage(replyToken, [
      {
        type: "text",
        text: `❌ 載入行程日期失敗：${err.message}`,
      },
    ])
  }
}

// 處理 /expenses_other_dates，列出該行程中實際有記帳紀錄的所有日期
async function handleOtherDatesCommand(replyToken: string, user: any) {
  if (!user) return

  const activeTripState = user.lineBotState?.activeTripId
  const activeTripId = activeTripState?.includes(":") ? activeTripState.split(":")[0] : activeTripState
  if (!activeTripId) return

  try {
    const trip = await prisma.trip.findUnique({
      where: { id: activeTripId },
    })

    let activeCountry = "TW"
    try {
      const { active } = parseTripCountries(trip?.countries, 1, 1)
      activeCountry = active
    } catch (e) {}
    const tzOffsetHours = getTripTimezoneOffset(trip, activeCountry)

    // 查詢有記帳記錄的日期
    const expenses = await prisma.expense.findMany({
      where: { tripId: activeTripId, userId: user.id },
      select: { date: true },
      orderBy: { date: "asc" },
    })

    const uniqueDates: string[] = []
    const seenDates = new Set<string>()

    expenses.forEach((e) => {
      if (e.date) {
        try {
          const localTime = new Date(e.date.getTime() + tzOffsetHours * 60 * 60 * 1000)
          const dStr = localTime.toISOString().split("T")[0]
          if (!seenDates.has(dStr)) {
            seenDates.add(dStr)
            uniqueDates.push(dStr)
          }
        } catch (err) {}
      }
    })

    if (uniqueDates.length === 0) {
      await replyMessage(replyToken, [
        {
          type: "text",
          text: "💡 該行程目前尚無任何記帳紀錄唷！",
        },
      ])
      return
    }

    const weekDays = ["週日", "週一", "週二", "週三", "週四", "週五", "週六"]
    const items = uniqueDates.slice(0, 13).map((dateStr) => {
      const d = new Date(dateStr)
      const month = d.getMonth() + 1
      const date = d.getDate()
      const dayName = weekDays[d.getDay()]
      return {
        type: "action",
        action: {
          type: "message",
          label: `${month}/${date} ${dayName}`,
          text: `/expenses_date ${dateStr}`,
        },
      }
    })

    await replyMessage(replyToken, [
      {
        type: "text",
        text: "📅 以下是目前該行程實際有記帳的日期，請選擇：",
        quickReply: { items },
      },
    ])
  } catch (err: any) {
    console.error("[LINE Other Dates Error]", err)
  }
}

// 處理日期花費卡片輪播查詢
async function handleDateExpensesQuery(replyToken: string, user: any, queryDateStr: string) {
  if (!user) return

  const activeTripState = user.lineBotState?.activeTripId
  const activeTripId = activeTripState?.includes(":") ? activeTripState.split(":")[0] : activeTripState
  if (!activeTripId) return

  try {
    const trip = await prisma.trip.findUnique({
      where: { id: activeTripId },
    })
    if (!trip) return

    // 1. 智慧目的地國家與時區計算
    const start = new Date(trip.startDate)
    const end = new Date(trip.endDate)
    const totalDays = Math.ceil((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)) + 1
    const queryDate = new Date(queryDateStr)
    const currentDay = Math.ceil((queryDate.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)) + 1

    const { list: tripCountries, active: activeCountry } = parseTripCountries(trip.countries, currentDay, totalDays)

    const tzOffsetHours = getTripTimezoneOffset(trip, activeCountry)

    // 2. 取得目的地當地當天的 UTC 物理時間區間
    const startOfDay = new Date(new Date(`${queryDateStr}T00:00:00.000Z`).getTime() - tzOffsetHours * 60 * 60 * 1000)
    const endOfDay = new Date(new Date(`${queryDateStr}T23:59:59.999Z`).getTime() - tzOffsetHours * 60 * 60 * 1000)

    // 3. 查詢當天消費
    const expenses = await prisma.expense.findMany({
      where: {
        tripId: activeTripId,
        userId: user.id,
        date: {
          gte: startOfDay,
          lte: endOfDay,
        },
      },
      orderBy: {
        createdAt: "asc",
      },
    })

    if (expenses.length === 0) {
      await replyMessage(replyToken, [
        {
          type: "text",
          text: `💡 您在 ${queryDateStr.replace(/-/g, "/")} 當天沒有任何花費紀錄唷！`,
        },
      ])
      return
    }

    const defaultCover = "https://images.unsplash.com/photo-1488646953014-85cb44e25828?w=800&q=80"
    const countrySceneryUrl = COUNTRY_SCENERY_MAP[activeCountry.toUpperCase()] || defaultCover

    // 4. 計算本日總額
    let dailyTotalTwd = 0
    expenses.forEach((exp) => {
      dailyTotalTwd += exp.convertedAmount || exp.amount
    })
    dailyTotalTwd = Math.round(dailyTotalTwd * 100) / 100

    const categoryMap: Record<string, string> = {
      food: "🍜 餐飲",
      transport: "🚃 交通",
      accommodation: "🛏️ 住宿",
      shopping: "🛍️ 購物",
      ticket: "🎫 門票",
      other: "📦 其他",
    }

    const baseCurrency = trip.baseCurrency || "TWD"
    const columns: any[] = []

    // 決定要放入實體消費卡片的筆數 (Carousel 限制 10 筆)
    const displayLimit = expenses.length > 9 ? 8 : expenses.length

    for (let i = 0; i < displayLimit; i++) {
      const exp = expenses[i]
      const title = exp.item.substring(0, 40)
      
      let textFmt = `分類: ${categoryMap[exp.category] || "其他"}\n金額: ${exp.amount} ${exp.currency}`
      if (exp.currency !== baseCurrency) {
        textFmt += `\n台幣: ${exp.convertedAmount} TWD`
      }

      // 卡片圖片安全判定：
      // 1. 使用者自行上傳的照片（若是 Base64 則使用代理路由轉為實體 HTTPS 連結，以符合 LINE 限制）
      // 2. 分類主題代表圖（若為交通類，特別區分機票與火車車票主題）
      // 3. Fallback 當天目的地國家風景照
      let imageUrl = countrySceneryUrl
      
      const images = Array.isArray(exp.images) ? (exp.images as string[]) : []
      if (images.length > 0 && typeof images[0] === "string") {
        if (images[0].startsWith("http")) {
          imageUrl = images[0]
        } else if (images[0].startsWith("data:image")) {
          imageUrl = `${currentOrigin}/api/trips/expenses/images/${exp.id}?index=0`
        }
      } else {
        if (exp.category === "transport") {
          const itemLower = (exp.item || "").toLowerCase()
          if (["機票", "飛機", "航空", "flight", "plane", "airline"].some(k => itemLower.includes(k))) {
            imageUrl = CATEGORY_IMAGE_MAP.transport // 飛機雲海照
          } else {
            imageUrl = "https://images.unsplash.com/photo-1541417904950-b855846fe074?w=800&q=80" // 精美歐洲火車鐵道照
          }
        } else {
          imageUrl = CATEGORY_IMAGE_MAP[exp.category] || countrySceneryUrl
        }
      }

      columns.push({
        thumbnailImageUrl: imageUrl,
        imageBackgroundColor: "#0F172A",
        title,
        text: textFmt,
        actions: [
          {
            type: "postback",
            label: "✏️ 編輯",
            data: `action=edit_expense_menu&expenseId=${exp.id}`,
          },
          {
            type: "postback",
            label: "❌ 刪除",
            data: `action=delete_expense&expenseId=${exp.id}`,
          },
        ],
      })
    }

    // 若大於 9 筆，追加一格「還有更多」卡片
    if (expenses.length > 9) {
      columns.push({
        thumbnailImageUrl: countrySceneryUrl,
        imageBackgroundColor: "#0F172A",
        title: "🔍 還有更多花費...",
        text: `今日還有其他 ${expenses.length - 8} 筆花費未在此顯示，請點選按鈕查看完整帳本。`,
        actions: [
          {
            type: "uri",
            label: "📊 前往網頁看完整帳本",
            uri: `https://travel-expense-bot-steel.vercel.app/trips/${trip.id}`,
          },
          {
            type: "message",
            label: "📅 查詢其他日期",
            text: "/expenses_other_dates",
          },
        ],
      })
    }

    // 追加最後一張「今日總結卡片」
    columns.push({
      thumbnailImageUrl: countrySceneryUrl,
      imageBackgroundColor: "#0F172A",
      title: `📊 今日結算 (${queryDateStr.replace(/-/g, "/")})`,
      text: `本日總花費: ${dailyTotalTwd} TWD\n已記錄花費共 ${expenses.length} 筆。`,
      actions: [
        {
          type: "uri",
          label: "📊 前往網頁看完整帳本",
          uri: `https://travel-expense-bot-steel.vercel.app/trips/${trip.id}`,
        },
        {
          type: "message",
          label: "📅 查詢其他日期",
          text: "/expenses_other_dates",
        },
      ],
    })

    const quickReply = await getExpensesDatesQuickReply(activeTripId, user.id, trip)

    await replyMessage(replyToken, [
      {
        type: "template",
        altText: `${queryDateStr} 當日消費清單與今日結算`,
        template: {
          type: "carousel",
          columns,
        },
        quickReply,
      },
    ])
  } catch (err: any) {
    console.error("[LINE Date Expenses Error]", err)
    try {
      await replyMessage(replyToken, [
        {
          type: "text",
          text: `❌ 載入消費卡片失敗，請稍候重試。錯誤詳情：${err.message || err}`,
        },
      ])
    } catch (e) {}
  }
}

// 處理一鍵刪除
async function handleDeleteExpense(replyToken: string, expenseId: string) {
  try {
    const expense = await prisma.expense.delete({
      where: { id: expenseId },
    })

    await replyMessage(replyToken, [
      {
        type: "text",
        text: `❌ 已成功刪除【${expense.item} ${expense.amount} ${expense.currency}】消費記錄！`,
      },
    ])
  } catch (err: any) {
    console.error("[handleDeleteExpense Error]", err)
    await replyMessage(replyToken, [
      {
        type: "text",
        text: `❌ 刪除花費失敗，該項目可能已被刪除。`,
      },
    ])
  }
}

// 處理編輯選單 (彈出欄位選擇 Quick Reply)
async function handleEditExpenseMenu(replyToken: string, expenseId: string) {
  try {
    const expense = await prisma.expense.findUnique({
      where: { id: expenseId },
    })

    if (!expense) {
      await replyMessage(replyToken, [
        {
          type: "text",
          text: "⚠️ 找不到該花費記錄，可能已被刪除。",
        },
      ])
      return
    }

    await replyMessage(replyToken, [
      {
        type: "text",
        text: `✏️ 請選擇您想要修改【${expense.item}】的哪個部分：`,
        quickReply: {
          items: [
            {
              type: "action",
              action: {
                type: "postback",
                label: "📝 修改品項名稱",
                data: `action=edit_field&field=item&expenseId=${expense.id}`,
                displayText: "修改品項名稱",
              },
            },
            {
              type: "action",
              action: {
                type: "postback",
                label: "📂 修改花費分類",
                data: `action=edit_field&field=category&expenseId=${expense.id}`,
                displayText: "修改花費分類",
              },
            },
            {
              type: "action",
              action: {
                type: "postback",
                label: "💰 修改消費金額",
                data: `action=edit_field&field=amount&expenseId=${expense.id}`,
                displayText: "修改消費金額",
              },
            },
            {
              type: "action",
              action: {
                type: "postback",
                label: "💱 修改消費幣別",
                data: `action=edit_field&field=currency&expenseId=${expense.id}`,
                displayText: "修改消費幣別",
              },
            },
          ],
        },
      },
    ])
  } catch (err: any) {
    console.error("[handleEditExpenseMenu Error]", err)
  }
}

// 處理編輯欄位動作 (品項名稱/金額 ➡️ 啟動對話攔截鎖定；分類 ➡️ 彈出分類選單)
async function handleEditField(replyToken: string, lineUserId: string, field: string, expenseId: string) {
  try {
    // 查詢 User
    const user = await prisma.user.findUnique({
      where: { lineUserId },
    })
    if (!user) return

    const expense = await prisma.expense.findUnique({
      where: { id: expenseId },
    })
    if (!expense) return

    if (field === "item") {
      const expires = new Date(Date.now() + 5 * 60 * 1000)
      await prisma.verificationToken.create({
        data: {
          identifier: `edit-prompt:${user.id}`,
          token: `item:${expenseId}`,
          expires,
        },
      })

      await replyMessage(replyToken, [
        {
          type: "text",
          text: `📝 請直接輸入【${expense.item}】的新項目名稱：`,
        },
      ])
    } else if (field === "amount") {
      const expires = new Date(Date.now() + 5 * 60 * 1000)
      await prisma.verificationToken.create({
        data: {
          identifier: `edit-prompt:${user.id}`,
          token: `amount:${expenseId}`,
          expires,
        },
      })

      await replyMessage(replyToken, [
        {
          type: "text",
          text: `💰 請直接輸入新金額數字（我們將維持原本的 ${expense.currency}，例如：1250）：`,
        },
      ])
    } else if (field === "category") {
      const categories = [
        { code: "food", label: "🍜 餐飲" },
        { code: "transport", label: "🚃 交通" },
        { code: "accommodation", label: "🛏️ 住宿" },
        { code: "shopping", label: "🛍️ 購物" },
        { code: "ticket", label: "🎫 門票" },
        { code: "other", label: "📦 其他" },
      ]

      const items = categories.map((cat) => ({
        type: "action",
        action: {
          type: "postback",
          label: cat.label,
          data: `action=update_field&field=category&value=${cat.code}&expenseId=${expenseId}`,
          displayText: `修改為 ${cat.label}`,
        },
      }))

      await replyMessage(replyToken, [
        {
          type: "text",
          text: `📂 請點選按鈕，選擇【${expense.item}】的新分類：`,
          quickReply: { items },
        },
      ])
    } else if (field === "currency") {
      const trip = await prisma.trip.findUnique({
        where: { id: expense.tripId },
      })
      if (!trip) return

      const currencies: { currency: string; name: string }[] = []
      const tripCountries = trip.countries || []
      for (const c of tripCountries) {
        const match = COUNTRY_CURRENCY_MAP[c.toUpperCase()]
        if (match) {
          currencies.push(match)
        }
      }
      for (const c of COMMON_CURRENCIES) {
        currencies.push(c)
      }
      const uniqueCurrencies: { currency: string; name: string }[] = []
      const seen = new Set<string>()
      for (const item of currencies) {
        if (!seen.has(item.currency)) {
          seen.add(item.currency)
          uniqueCurrencies.push(item)
        }
      }

      const finalCurrencies = uniqueCurrencies.slice(0, 11)

      const items = finalCurrencies.map((c) => ({
        type: "action",
        action: {
          type: "postback",
          label: `${c.name} ${c.currency}`,
          data: `action=update_field&field=currency&value=${c.currency}&expenseId=${expenseId}`,
          displayText: `修改為 ${c.name} ${c.currency}`,
        },
      }))

      await replyMessage(replyToken, [
        {
          type: "text",
          text: `💱 請點選下方按鈕，選擇修改【${expense.item}】的記帳幣別：\n（目前為：${expense.currency}）`,
          quickReply: { items },
        },
      ])
    }
  } catch (err: any) {
    console.error("[handleEditField Error]", err)
  }
}

// 處理分類的直接修改寫入
async function handleUpdateField(replyToken: string, field: string, value: string, expenseId: string) {
  try {
    if (field === "category") {
      const categoryMap: Record<string, string> = {
        food: "🍜 餐飲",
        transport: "🚃 交通",
        accommodation: "🛏️ 住宿",
        shopping: "🛍️ 購物",
        ticket: "🎫 門票",
        other: "📦 其他",
      }

      const expense = await prisma.expense.update({
        where: { id: expenseId },
        data: { category: value },
      })

      await replyMessage(replyToken, [
        {
          type: "text",
          text: `📂 分類修改成功！【${expense.item}】的分類已改為：${categoryMap[value] || value}。`,
        },
      ])
    } else if (field === "currency") {
      const expense = await prisma.expense.findUnique({
        where: { id: expenseId },
        include: { trip: true },
      })
      if (!expense) return

      const trip = expense.trip
      const baseCurrency = trip.baseCurrency || "TWD"
      const conversion = await convertExpenseAmount(expense.amount, value, baseCurrency)
      const convertedAmount = conversion ? conversion.convertedAmount : expense.amount
      const exchangeRate = conversion ? conversion.exchangeRate : 1.0

      await prisma.expense.update({
        where: { id: expenseId },
        data: {
          currency: value,
          convertedAmount,
          exchangeRate,
        },
      })

      const user = await prisma.user.findUnique({
        where: { id: expense.userId },
        include: { lineBotState: true },
      })
      const activeTripState = user?.lineBotState?.activeTripId
      let userActiveCurrency = null
      if (activeTripState && activeTripState.includes(":")) {
        userActiveCurrency = activeTripState.split(":")[1]
      }

      const currencyName = ALL_CURRENCY_NAMES[value.toUpperCase()] || ""
      const displayName = currencyName ? `${currencyName} (${value})` : value

      await replyMessage(replyToken, [
        {
          type: "text",
          text: `💱 幣別修改成功！\n\n【${expense.item}】的記帳幣別已改為 ${displayName}。\n💰 金額：${expense.amount} ${value}\n💱 換算台幣：${convertedAmount} TWD (匯率 ${exchangeRate})`,
          quickReply: await getQuickReply(trip, userActiveCurrency),
        },
      ])
    }
  } catch (err: any) {
    console.error("[handleUpdateField Error]", err)
  }
}

// 處理對話式文字直接寫入
async function handleDirectTextUpdate(replyToken: string, expenseId: string, field: string, text: string) {
  try {
    const expense = await prisma.expense.findUnique({
      where: { id: expenseId },
      include: { trip: true },
    })

    if (!expense) {
      await replyMessage(replyToken, [
        {
          type: "text",
          text: "⚠️ 找不到對應的花費項目，修改失敗。",
        },
      ])
      return
    }

    const user = await prisma.user.findUnique({
      where: { id: expense.userId },
      include: { lineBotState: true },
    })

    const activeTripState = user?.lineBotState?.activeTripId
    let userActiveCurrency = null
    if (activeTripState && activeTripState.includes(":")) {
      userActiveCurrency = activeTripState.split(":")[1]
    }

    if (field === "item") {
      await prisma.expense.update({
        where: { id: expenseId },
        data: { item: text },
      })

      await replyMessage(replyToken, [
        {
          type: "text",
          text: `📝 項目名稱已成功修改為：【${text}】！`,
          quickReply: await getQuickReply(expense.trip, userActiveCurrency),
        },
      ])
    } else if (field === "amount") {
      const newAmount = parseFloat(text)
      if (isNaN(newAmount) || newAmount <= 0) {
        await replyMessage(replyToken, [
          {
            type: "text",
            text: "❌ 修改失敗：請輸入正確的正數金額數字。",
          },
        ])
        return
      }

      const trip = expense.trip
      const baseCurrency = trip.baseCurrency || "TWD"
      const conversion = await convertExpenseAmount(newAmount, expense.currency, baseCurrency)
      const convertedAmount = conversion ? conversion.convertedAmount : newAmount
      const exchangeRate = conversion ? conversion.exchangeRate : 1.0

      await prisma.expense.update({
        where: { id: expenseId },
        data: {
          amount: newAmount,
          convertedAmount,
          exchangeRate,
        },
      })

      await replyMessage(replyToken, [
        {
          type: "text",
          text: `💰 金額已成功修改為：【${newAmount} ${expense.currency}】！\n💱 換算台幣：${convertedAmount} TWD`,
          quickReply: await getQuickReply(expense.trip, userActiveCurrency),
        },
      ])
    }
  } catch (err: any) {
    console.error("[handleDirectTextUpdate Error]", err)
    await replyMessage(replyToken, [
      {
        type: "text",
        text: `❌ 修改失敗：${err.message}`,
      },
    ])
  }
}
