/**
 * 個人 LINE 帳號連動碼與連動狀態 API
 */
import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { Prisma } from "@prisma/client"
import { randomInt } from "crypto"

// GET — 查詢當前登入使用者的 LINE 綁定狀態與當前預設行程
export async function GET() {
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
      const activeTripId = botState.activeTripId.split(":")[0]
      const trip = await prisma.trip.findUnique({
        where: { id: activeTripId },
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
export async function POST() {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "未登入" }, { status: 401 })
    }

    const userId = session.user.id
    const identifier = `line-link:${userId}`

    // 1. 設定 15 分鐘過期
    const expires = new Date(Date.now() + 15 * 60 * 1000)

    // 2. 清除此使用者舊的個人綁定碼
    await prisma.verificationToken.deleteMany({
      where: { identifier },
    })

    // 3. 直接以資料庫 unique constraint 防碰撞，避免「先查再寫」競態。
    let verification = null
    for (let attempt = 0; attempt < 10 && !verification; attempt += 1) {
      const token = randomInt(100_000, 1_000_000).toString()
      try {
        verification = await prisma.verificationToken.create({
          data: { identifier, token, expires },
        })
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
          continue
        }
        throw error
      }
    }

    if (!verification) {
      return NextResponse.json({ error: "無法產生唯一的配對碼，請稍後再試" }, { status: 503 })
    }

    return NextResponse.json({
      token: verification.token,
      expires: verification.expires,
    })
  } catch (error) {
    console.error("[LINE User Link API Error]", error)
    return NextResponse.json({ error: "伺服器內部錯誤" }, { status: 500 })
  }
}
