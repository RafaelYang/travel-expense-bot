/**
 * 產生 LINE 行程連動配對碼 API
 */
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

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

    // 1. 驗證是否為該行程的成員
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

    // 2. 產生唯一的 6 位數配對碼
    let token = ""
    let isUnique = false
    let attempts = 0

    while (!isUnique && attempts < 10) {
      attempts++
      // 產生 100000 - 999999 的隨機數
      token = Math.floor(100000 + Math.random() * 900000).toString()

      // 檢查是否已存在且未過期
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

    // 3. 設定 15 分鐘過期
    const expires = new Date(Date.now() + 15 * 60 * 1000)

    // 4. 清除該行程舊的配對碼，並建立新的
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
    console.error("[LINE Link API Error]", error)
    return NextResponse.json({ error: "伺服器內部錯誤" }, { status: 500 })
  }
}
