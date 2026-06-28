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

  try {
    const res = await fetch("https://api.line.me/v2/bot/message/reply", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        replyToken,
        messages,
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

export async function POST(req: NextRequest) {
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
    await replyMessage(replyToken, [
      {
        type: "text",
        text: "💡 LINE 快速記帳格式：\n[品項] [金額] [幣別(選填)]\n\n📝 範例：\n- 拉麵 1500 JPY\n- 捷運 35\n- 樂高 100 USD\n\n📌 常用指令：\n- `/status`：查詢目前連動行程\n- `/list`：列出行程並一鍵切換\n- 點選下方快速選單切換記帳幣別",
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
        text: `🎉 帳號連結成功！\n\n您的 LINE 帳號已順利與網頁端帳號連動。${activeTripText}\n\n📌 常用功能指令：\n- 直接輸入「品項 金額」即可記帳！\n- 傳送 \`/status\` 查詢目前鎖定的記帳行程。\n- 傳送 \`/list\` 可切換其他行程。`,
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

      const title = trip.name.substring(0, 40) // 標題限制 40 字
      const isActive = trip.id === activeTripId
      
      // 內文最多 60 字
      let description = `${startFmt} - ${endFmt}\n狀態: ${dayInfo.dayText}`
      if (isActive) {
        description += ` (⭐ 目前預設)`
      }

      return {
        title,
        text: description.substring(0, 60),
        actions: [
          {
            type: "postback",
            label: isActive ? "⭐ 目前預設" : "設為預設記帳行程",
            data: `action=switch_trip&tripId=${trip.id}`,
            displayText: `將【${trip.name}】設為 LINE 預設記帳`,
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

  // 1. 抓取目的地國家對應幣別
  const tripCountries = trip.countries || []
  for (const c of tripCountries) {
    const match = COUNTRY_CURRENCY_MAP[c.toUpperCase()]
    if (match) {
      currencies.push(match)
    }
  }

  // 2. 加入常用四種幣別
  for (const c of COMMON_CURRENCIES) {
    currencies.push(c)
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
  const activeCurrencyCode = userActiveCurrency || trip.defaultCurrency || "TWD"
  const activeIndex = uniqueCurrencies.findIndex(c => c.currency === activeCurrencyCode)
  if (activeIndex > -1) {
    const [activeItem] = uniqueCurrencies.splice(activeIndex, 1)
    uniqueCurrencies.unshift(activeItem)
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
      text: "/currency",
    },
  })

  return { items }
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

      let instruction = `💡 想要手動切換其他幣別？\n請直接輸入：\n/currency [三碼幣別] (不限大小寫)\n\n📝 範例：\n- \`/currency GBP\` (切換為英鎊)\n- \`/currency HKD\` (切換為港幣)`
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
        text: `💱 幣別切換成功！\n\n您在 LINE 的預設記帳幣別已鎖定為 **${displayName}**。\n\n接下來您直接傳送金額（例如：\`拉麵 1500\`），將會自動記為 ${targetCurrency} 唷！`,
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
