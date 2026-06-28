/**
 * 產生 LINE 行程連動碼、查詢狀態與一鍵設為預設記帳行程 API
 */
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

// 計算行程狀態
function getTripDayText(startDate: Date, endDate: Date): string {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const start = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate()).getTime()
  const end = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate()).getTime()
  const oneDayMs = 24 * 60 * 60 * 1000

  const startFmt = startDate.toISOString().split("T")[0].replace(/-/g, "/")
  const endFmt = endDate.toISOString().split("T")[0].replace(/-/g, "/")

  if (today < start) {
    const diffDays = Math.ceil((start - today) / oneDayMs)
    return `尚未開始 (將於 ${diffDays} 天後 ${startFmt} 開始)`
  } else if (today > end) {
    const diffDays = Math.ceil((today - end) / oneDayMs)
    return `已結束 (${diffDays} 天前於 ${endFmt} 結束)`
  } else {
    const totalDays = Math.ceil((end - start) / oneDayMs) + 1
    const currentDay = Math.ceil((today - start) / oneDayMs) + 1
    return `進行中 (Day ${currentDay}/${totalDays})`
  }
}

// GET — 查詢此行程對於當前使用者的 LINE 連動狀態
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ tripId: string }> }
) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "未登入" }, { status: 401 })
    }

    const { tripId } = await params
    const userId = session.user.id

    // 1. 取得使用者與其 LINE 狀態
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { lineBotState: true },
    })

    if (!user) {
      return NextResponse.json({ error: "找不到使用者" }, { status: 404 })
    }

    // 2. 取得行程資訊
    const trip = await prisma.trip.findUnique({
      where: { id: tripId },
    })

    if (!trip) {
      return NextResponse.json({ error: "找不到行程" }, { status: 404 })
    }

    const hasLinkedLine = user.lineUserId !== null
    const activeState = user.lineBotState?.activeTripId || ""
    const isActive = activeState.split(":")[0] === tripId
    const dayText = getTripDayText(trip.startDate, trip.endDate)

    // 取得 LINE 連動的當前記帳幣別
    let lineCurrency = null
    if (isActive) {
      lineCurrency = activeState.includes(":") ? activeState.split(":")[1] : (trip.defaultCurrency || "TWD")
    }

    return NextResponse.json({
      hasLinkedLine,
      isActive,
      dayText,
      lineCurrency,
    })
  } catch (error) {
    console.error("[GET LINE Link Status Error]", error)
    return NextResponse.json({ error: "伺服器內部錯誤" }, { status: 500 })
  }
}

// POST — 產生配對碼 (向後相容，但現在主要使用個人配對碼)
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ tripId: string }> }
) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "未登入" }, { status: 401 })
    }

    const { tripId } = await params
    const userId = session.user.id

    const tripMember = await prisma.tripMember.findUnique({
      where: {
        tripId_userId: {
          tripId,
          userId,
        },
      },
    })

    if (!tripMember) {
      return NextResponse.json(
        { error: "權限不足，您非此行程成員" },
        { status: 403 }
      )
    }

    let token = ""
    let isUnique = false
    let attempts = 0

    while (!isUnique && attempts < 10) {
      attempts++
      token = Math.floor(100000 + Math.random() * 900000).toString()

      const existingLink = await prisma.lineTripLink.findFirst({
        where: {
          token,
          expires: {
            gt: new Date(),
          },
        },
      })

      if (!existingLink) {
        isUnique = true
      }
    }

    if (!isUnique) {
      return NextResponse.json(
        { error: "無法產生唯一的配對碼，請稍後再試" },
        { status: 500 }
      )
    }

    const expires = new Date(Date.now() + 15 * 60 * 1000)

    await prisma.lineTripLink.deleteMany({
      where: { tripId },
    })

    const link = await prisma.lineTripLink.create({
      data: {
        tripId,
        token,
        expires,
      },
    })

    return NextResponse.json({
      token: link.token,
      expires: link.expires,
    })
  } catch (error) {
    console.error("[LINE Link API POST Error]", error)
    return NextResponse.json({ error: "伺服器內部錯誤" }, { status: 500 })
  }
}

// PUT — 網頁端一鍵將此行程設定為預設 LINE 記帳行程，並可設定其記帳幣別
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ tripId: string }> }
) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "未登入" }, { status: 401 })
    }

    const { tripId } = await params
    const userId = session.user.id

    // 1. 檢查使用者是否已綁定 LINE
    const user = await prisma.user.findUnique({
      where: { id: userId },
    })

    if (!user || !user.lineUserId) {
      return NextResponse.json(
        { error: "請先完成個人 LINE 帳號連動" },
      { status: 400 }
      )
    }

    // 2. 檢查是否為行程成員
    const tripMember = await prisma.tripMember.findUnique({
      where: {
        tripId_userId: {
          tripId,
          userId,
        },
      },
    })

    if (!tripMember) {
      return NextResponse.json(
        { error: "權限不足，您非此行程成員" },
        { status: 403 }
      )
    }

    // 3. 更新 LINE Bot 狀態 (可選擇性傳入特定幣別)
    let newActiveTripId = tripId
    try {
      const body = await req.json()
      if (body && body.currency) {
        newActiveTripId = `${tripId}:${body.currency.toUpperCase()}`
      }
    } catch (e) {
      // 忽略無 JSON body 的情況
    }

    await prisma.lineBotState.upsert({
      where: { userId },
      update: { activeTripId: newActiveTripId },
      create: {
        userId,
        activeTripId: newActiveTripId,
      },
    })

    return NextResponse.json({ success: true, activeTripId: newActiveTripId })
  } catch (error) {
    console.error("[PUT LINE Link Error]", error)
    return NextResponse.json({ error: "伺服器內部錯誤" }, { status: 500 })
  }
}
