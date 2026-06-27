/**
 * 個人 LINE 帳號連動碼與連動狀態 API
 */
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

// GET — 查詢當前登入使用者的 LINE 綁定狀態與當前預設行程
export async function GET(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "未登入" }, { status: 401 })
    }

    const userId = session.user.id

    const user = await prisma.user.findUnique({
      where: { id: userId },
    })

    if (!user) {
      return NextResponse.json({ error: "找不到使用者" }, { status: 404 })
    }

    let activeTripName: string | null = null
    const botState = await prisma.lineBotState.findUnique({
      where: { userId },
    })

    if (botState?.activeTripId) {
      const trip = await prisma.trip.findUnique({
        where: { id: botState.activeTripId },
      })
      activeTripName = trip?.name || null
    }

    return NextResponse.json({
      hasLinkedLine: user.lineUserId !== null,
      activeTripName,
    })
  } catch (error) {
    console.error("[GET User LINE Link Status Error]", error)
    return NextResponse.json({ error: "伺服器內部錯誤" }, { status: 500 })
  }
}

// POST — 產生 15 分鐘有效的 6 位個人連動碼
export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "未登入" }, { status: 401 })
    }

    const userId = session.user.id
    const identifier = `line-link:${userId}`

    // 1. 產生唯一的 6 位數配對碼
    let token = ""
    let isUnique = false
    let attempts = 0

    while (!isUnique && attempts < 10) {
      attempts++
      token = Math.floor(100000 + Math.random() * 900000).toString()

      // 檢查此配對碼是否已存在且未過期
      const existingToken = await prisma.verificationToken.findFirst({
        where: {
          token,
          expires: {
            gt: new Date(),
          },
        },
      })

      if (!existingToken) {
        isUnique = true
      }
    }

    if (!isUnique) {
      return NextResponse.json(
        { error: "無法產生唯一的配對碼，請稍後再試" },
        { status: 500 }
      )
    }

    // 2. 設定 15 分鐘過期
    const expires = new Date(Date.now() + 15 * 60 * 1000)

    // 3. 清除此使用者舊的個人綁定碼
    await prisma.verificationToken.deleteMany({
      where: { identifier },
    })

    // 4. 寫入 VerificationToken
    const verification = await prisma.verificationToken.create({
      data: {
        identifier,
        token,
        expires,
      },
    })

    return NextResponse.json({
      token: verification.token,
      expires: verification.expires,
    })
  } catch (error) {
    console.error("[LINE User Link API Error]", error)
    return NextResponse.json({ error: "伺服器內部錯誤" }, { status: 500 })
  }
}
