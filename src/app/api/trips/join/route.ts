/**
 * 加入行程 API（透過邀請碼）
 */
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { Prisma } from "@prisma/client"
import { z } from "zod"

const joinSchema = z.object({
  code: z.string().length(6, "邀請碼為 6 位英數字"),
})

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "未登入" }, { status: 401 })
  }

  try {
    const body = await req.json()
    const { code } = joinSchema.parse(body)

    // 查找邀請碼
    const inviteCode = await prisma.inviteCode.findUnique({
      where: { code },
      include: { trip: true },
    })

    if (!inviteCode) {
      return NextResponse.json({ error: "邀請碼無效" }, { status: 400 })
    }

    if (inviteCode.expires < new Date()) {
      return NextResponse.json({ error: "邀請碼已過期" }, { status: 400 })
    }

    if (inviteCode.usedCount >= inviteCode.maxUses) {
      return NextResponse.json({ error: "邀請碼已達使用上限" }, { status: 400 })
    }

    // 檢查是否已是成員
    const existing = await prisma.tripMember.findUnique({
      where: {
        tripId_userId: {
          tripId: inviteCode.tripId,
          userId: session.user.id,
        },
      },
    })

    if (existing) {
      return NextResponse.json({ error: "你已經是此行程的成員" }, { status: 400 })
    }

    // 在同一個 transaction 內占用名額並加入行程，避免並發請求超過上限。
    const joined = await prisma.$transaction(async (tx) => {
      const claimed = await tx.inviteCode.updateMany({
        where: {
          id: inviteCode.id,
          expires: { gt: new Date() },
          usedCount: { lt: inviteCode.maxUses },
        },
        data: { usedCount: { increment: 1 } },
      })

      if (claimed.count !== 1) {
        return false
      }

      await tx.tripMember.create({
        data: {
          tripId: inviteCode.tripId,
          userId: session.user.id,
          role: inviteCode.role,
        },
      })

      return true
    })

    if (!joined) {
      return NextResponse.json({ error: "邀請碼已過期或已達使用上限" }, { status: 400 })
    }

    return NextResponse.json({
      success: true,
      tripId: inviteCode.tripId,
      tripName: inviteCode.trip.name,
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0].message }, { status: 400 })
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ error: "你已經是此行程的成員" }, { status: 400 })
    }
    console.error("Join trip error:", error)
    return NextResponse.json({ error: "加入失敗" }, { status: 500 })
  }
}
