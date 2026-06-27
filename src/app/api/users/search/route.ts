/**
 * 使用者搜尋 API — 根據 email 前綴搜尋已註冊帳號
 * 用於邀請時的 autocomplete 建議
 */
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "未登入" }, { status: 401 })
  }

  const q = request.nextUrl.searchParams.get("q")?.trim()
  if (!q || q.length < 2) {
    return NextResponse.json({ users: [] })
  }

  try {
    // 搜尋 email 或名稱包含關鍵字的使用者（排除自己）
    const users = await prisma.user.findMany({
      where: {
        AND: [
          { id: { not: session.user.id } },
          {
            OR: [
              { email: { contains: q, mode: "insensitive" } },
              { name: { contains: q, mode: "insensitive" } },
            ],
          },
        ],
      },
      select: {
        id: true,
        name: true,
        email: true,
        image: true,
      },
      take: 5, // 最多顯示 5 筆建議
    })

    return NextResponse.json({ users })
  } catch (error) {
    console.error("[UserSearch] Error:", error)
    return NextResponse.json({ users: [] })
  }
}
