/**
 * 產生個人 LINE 帳號綁定配對碼 API
 */
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

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

    // 4. 寫入 VerificationToken (用來做暫時性個人配對碼)
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
