/**
 * LINE Messaging API Webhook
 * 用於處理 LINE Bot 記帳與行程連動
 */
import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import crypto from "crypto"
import { convertExpenseAmount } from "@/lib/exchange-rate"

// LINE 回覆訊息的共用 Fetch 函數 (避免 Edge Runtime/Serverless 套件相容性問題)
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

export async function POST(req: NextRequest) {
  const channelSecret = process.env.LINE_CHANNEL_SECRET || ""
  const signature = req.headers.get("x-line-signature") || ""

  try {
    const bodyText = await req.text()

    // 1. 驗證請求來源是否確實為 LINE
    if (!verifySignature(bodyText, signature, channelSecret)) {
      console.warn("[LINE Webhook] 簽章驗證失敗")
      return new Response("Unauthorized", { status: 401 })
    }

    const payload = JSON.parse(bodyText)
    const events = payload.events || []

    for (const event of events) {
      // 只處理文字訊息事件
      if (event.type === "message" && event.message.type === "text") {
        await handleTextMessage(event)
      }
    }

    return new Response("OK", { status: 200 })
  } catch (error) {
    console.error("[LINE Webhook Error]", error)
    return new Response("Internal Server Error", { status: 500 })
  }
}

// 處理文字訊息事件
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

  // 2. 解析是否有連動指令：/link 6位配對碼
  const linkMatch = text.match(/^\/link\s+(\d{6})$/i)

  if (linkMatch) {
    const token = linkMatch[1]
    await handleLinkCommand(replyToken, lineUserId, user, token)
    return
  }

  // 3. 一般文字記帳流程
  if (!user) {
    // 找不到使用者，提示綁定
    await replyMessage(replyToken, [
      {
        type: "text",
        text: "⚠️ 您的 LINE 帳號尚未與「小銘子記帳」網站連結。\n\n請先在網頁端使用 Google 登入後，到「行程設定」中產生配對碼，並在 LINE 傳送：\n/link [6位配對碼]\n\n即可完成帳號與行程的連動！",
      },
    ])
    return
  }

  const activeTripId = user.lineBotState?.activeTripId

  if (!activeTripId) {
    await replyMessage(replyToken, [
      {
        type: "text",
        text: "💡 您目前尚未選定或綁定任何活動行程。\n\n請先前往網頁端的「行程設定」取得 LINE 連動碼，並於 LINE 傳送：\n/link [6位配對碼]\n\n完成後即可直接在這裡打字記帳！",
      },
    ])
    return
  }

  // 4. 解析記帳語法
  // 正則支援：[品項] [金額] [可選三位英文字幣別]
  // 例如：拉麵 1500 JPY、捷運 35
  const expenseMatch = text.match(/^(.+?)\s+(\d+(?:\.\d+)?)(?:\s+([a-zA-Z]{3}))?$/)

  if (!expenseMatch) {
    await replyMessage(replyToken, [
      {
        type: "text",
        text: "💡 LINE 快速記帳格式：\n[品項] [金額] [幣別(選填)]\n\n📝 範例：\n- 拉麵 1500 JPY\n- 捷運 35\n- 樂高 100 USD",
      },
    ])
    return
  }

  const item = expenseMatch[1].trim()
  const amount = parseFloat(expenseMatch[2])
  const currency = (expenseMatch[3] || "TWD").toUpperCase()

  try {
    // 查詢行程資訊，確定基準幣種 (baseCurrency)
    const trip = await prisma.trip.findUnique({
      where: { id: activeTripId },
    })

    if (!trip) {
      await replyMessage(replyToken, [
        {
          type: "text",
          text: "⚠️ 找不到您目前綁定的行程，可能該行程已被刪除。請重新至網頁端進行綁定。",
        },
      ])
      return
    }

    // 自動分類判斷
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

    // 回覆成功訊息
    let replyText = `✅ 記帳成功！\n\n📌 項目：${item}\n💰 金額：${amount} ${currency}\n📂 分類：${categoryNameMap[category]}`
    if (currency !== baseCurrency) {
      replyText += `\n💱 換算：${convertedAmount} ${baseCurrency} (匯率 ${exchangeRate})`
    }

    await replyMessage(replyToken, [
      {
        type: "text",
        text: replyText,
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

// 處理連動指令
async function handleLinkCommand(replyToken: string, lineUserId: string, user: any, token: string) {
  try {
    // 1. 查詢配對碼是否存在且未過期
    const link = await prisma.lineTripLink.findFirst({
      where: {
        token,
        expires: {
          gt: new Date(),
        },
      },
      include: { trip: true },
    })

    if (!link) {
      await replyMessage(replyToken, [
        {
          type: "text",
          text: "❌ 綁定失敗：連動碼無效或已過期 (限時 15 分鐘)。\n請在網頁端重新產生連動碼後再試一次！",
        },
      ])
      return
    }

    const trip = link.trip
    let targetUserId = user?.id

    // 2. 如果目前此 LINE 使用者尚未綁定網頁端帳號，我們需要先進行綁定
    // 為了安全起見，如果 user 不存在，但在 Prisma 中有某個 User 的連動碼剛好被這個 LINE 使用者輸入，
    // 但因為 `LineTripLink` 沒記是哪個網頁使用者產生的，
    // 因此在「無綁定帳號」的情況下，我們需要請使用者先登入網頁，在頁面觸發「綁定帳號」的機制。
    // 不過！如果使用者目前沒有 User，我們可以依據 link.trip 內的擁有者或成員是誰來綁定？這不安全。
    // 所以還是必須強制要求先有 User。
    if (!targetUserId) {
      await replyMessage(replyToken, [
        {
          type: "text",
          text: "⚠️ 帳號未連結：請先在手機或電腦瀏覽器打開「小銘子記帳」網站，使用 Google 登入後，到「行程設定」中連結 LINE 帳號，方可進行配對。",
        },
      ])
      return
    }

    // 3. 驗證該使用者是否為該行程的成員
    const tripMember = await prisma.tripMember.findUnique({
      where: {
        tripId_userId: {
          tripId: trip.id,
          userId: targetUserId,
        },
      },
    })

    if (!tripMember) {
      await replyMessage(replyToken, [
        {
          type: "text",
          text: `⚠️ 權限不足：您雖然已登入，但您似乎並不是行程【${trip.name}】的成員。請先請行程擁有者邀請您加入。`,
        },
      ])
      return
    }

    // 4. 更新或建立 LINE Bot 狀態
    await prisma.lineBotState.upsert({
      where: { userId: targetUserId },
      update: { activeTripId: trip.id },
      create: {
        userId: targetUserId,
        activeTripId: trip.id,
      },
    })

    // 5. 為了以防萬一，再次更新使用者的 lineUserId
    await prisma.user.update({
      where: { id: targetUserId },
      data: { lineUserId },
    })

    // 6. 清除配對碼避免重複使用
    await prisma.lineTripLink.delete({
      where: { id: link.id },
    })

    await replyMessage(replyToken, [
      {
        type: "text",
        text: `🎉 綁定成功！\n\n您已成功將此 LINE 帳號連動至行程：\n✈️【${trip.name}】\n\n現在您在此對話框中直接輸入：\n「品項 金額 (幣種)」\n（例如：拉麵 1500 JPY 或 捷運 35）\n\n系統就會自動幫您寫入帳本中囉！`,
      },
    ])
  } catch (err: any) {
    console.error("[LINE Link Error]", err)
    await replyMessage(replyToken, [
      {
        type: "text",
        text: `❌ 連動處理失敗，伺服器錯誤：${err.message}`,
      },
    ])
  }
}

// 根據品項名稱判斷花費分類
function getAutoCategory(item: string): string {
  const itemLower = item.toLowerCase()

  // 1. 餐飲
  if (
    ["麵", "飯", "餐", "吃", "午餐", "晚餐", "早餐", "下午茶", "點心", "飲料", "咖啡", "水", "酒", "拉麵", "壽司", "燒肉", "牛排", "food", "eat", "drink", "coffee", "restaurant", "便當", "火鍋", "冰", "甜點", "宵夜"].some(
      (k) => itemLower.includes(k)
    )
  ) {
    return "food"
  }

  // 2. 交通
  if (
    ["車", "捷運", "地鐵", "火車", "計程車", "ubike", "租車", "油", "機票", "公車", "巴士", "高鐵", "新幹線", "船", "悠遊卡", "suica", "icoca", "transport", "bus", "train", "flight", "taxi", "gas"].some(
      (k) => itemLower.includes(k)
    )
  ) {
    return "transport"
  }

  // 3. 住宿
  if (
    ["飯店", "民宿", "住", "房", "旅館", "青旅", "hotel", "hostel", "airbnb", "stay", "住宿"].some(
      (k) => itemLower.includes(k)
    )
  ) {
    return "accommodation"
  }

  // 4. 購物
  if (
    ["買", "藥妝", "購物", "衣服", "紀念品", "伴手禮", "免稅", "outlet", "商場", "百貨", "shopping", "gift", "鞋", "包", "特產", "超市"].some(
      (k) => itemLower.includes(k)
    )
  ) {
    return "shopping"
  }

  // 5. 門票
  if (
    ["門票", "票", "入場", "環球影城", "迪士尼", "樂園", "觀光", "博物館", "展覽", "ticket", "pass", "纜車", "體驗"].some(
      (k) => itemLower.includes(k)
    )
  ) {
    return "ticket"
  }

  return "other"
}
