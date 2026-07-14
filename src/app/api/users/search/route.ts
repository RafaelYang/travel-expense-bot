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
  if (!q || q.length < 3) {
    return NextResponse.json({ users: [] })
  }

  try {
    // 只建議曾共同參與行程的使用者，避免把全站帳號當成公開目錄。
    const users = await prisma.user.findMany({
      where: {
        AND: [
          { id: { not: session.user.id } },
          {
            tripMembers: {
              some: {
                trip: {
                  members: { some: { userId: session.user.id } },
                },
              },
            },
          },
          {
            OR: [
              { email: { startsWith: q, mode: "insensitive" } },
              { name: { startsWith: q, mode: "insensitive" } },
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
