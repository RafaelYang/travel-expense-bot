/**
 * 接受邀請 API — 驗證 token + 加入行程
 */
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { Prisma } from "@prisma/client"

// POST — 接受邀請
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "未登入" }, { status: 401 })
  }

  try {
    const body = await req.json()
    const { token } = body

    if (!token) {
      return NextResponse.json({ error: "缺少邀請 token" }, { status: 400 })
    }

    // 查找邀請
    const invite = await prisma.emailInvite.findUnique({
      where: { token },
      include: { trip: true },
    })

    if (!invite) {
      return NextResponse.json({ error: "邀請連結無效" }, { status: 400 })
    }

    if (invite.status !== "pending") {
      return NextResponse.json({ error: "此邀請已被使用" }, { status: 400 })
    }

    const sessionEmail = session.user.email?.trim().toLowerCase()
    if (!sessionEmail || sessionEmail !== invite.email.trim().toLowerCase()) {
      return NextResponse.json({ error: "請使用收到邀請的 Email 帳號登入" }, { status: 403 })
    }

    if (invite.expires < new Date()) {
      // 更新狀態為 expired
      await prisma.emailInvite.update({
        where: { id: invite.id },
        data: { status: "expired" },
      })
      return NextResponse.json({ error: "邀請連結已過期" }, { status: 400 })
    }

    // 檢查是否已是成員
    const existing = await prisma.tripMember.findUnique({
      where: {
        tripId_userId: {
          tripId: invite.tripId,
          userId: session.user.id,
        },
      },
    })

    if (existing) {
      await prisma.emailInvite.updateMany({
        where: { id: invite.id, status: "pending" },
        data: { status: "accepted" },
      })
      return NextResponse.json({
        success: true,
        tripId: invite.tripId,
        tripName: invite.trip.name,
        message: "你已經是此行程的成員",
      })
    }

    // 先在 transaction 內原子占用 token，避免同一邀請被並發重複兌換。
    const accepted = await prisma.$transaction(async (tx) => {
      const claimed = await tx.emailInvite.updateMany({
        where: {
          id: invite.id,
          status: "pending",
          expires: { gt: new Date() },
        },
        data: { status: "accepted" },
      })

      if (claimed.count !== 1) {
        return false
      }

      await tx.tripMember.create({
        data: {
          tripId: invite.tripId,
          userId: session.user.id,
          role: invite.role,
        },
      })

      return true
    })

    if (!accepted) {
      return NextResponse.json({ error: "此邀請已被使用或已過期" }, { status: 400 })
    }

    return NextResponse.json({
      success: true,
      tripId: invite.tripId,
      tripName: invite.trip.name,
    })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ error: "你已經是此行程的成員" }, { status: 400 })
    }
    console.error("[InviteAccept] Error:", error)
    return NextResponse.json({ error: "加入失敗" }, { status: 500 })
  }
}

// GET — 查詢邀請資訊（不需登入）
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token")

  if (!token) {
    return NextResponse.json({ error: "缺少 token" }, { status: 400 })
  }

  const invite = await prisma.emailInvite.findUnique({
    where: { token },
    include: {
      trip: {
        select: { id: true, name: true, startDate: true, endDate: true },
      },
    },
  })

  if (!invite) {
    return NextResponse.json({ error: "邀請連結無效" }, { status: 404 })
  }

  if (invite.status !== "pending" || invite.expires < new Date()) {
    // 如果使用者已登入，檢查是否已是行程成員
    const session = await auth()
    if (session?.user?.id) {
      const existing = await prisma.tripMember.findUnique({
        where: {
          tripId_userId: {
            tripId: invite.tripId,
            userId: session.user.id,
          },
        },
      })
      if (existing) {
        return NextResponse.json({
          alreadyMember: true,
          tripId: invite.tripId,
        })
      }
    }
    return NextResponse.json({ error: "邀請連結已過期" }, { status: 410 })
  }

  // 查詢邀請人名稱
  const inviter = await prisma.user.findUnique({
    where: { id: invite.invitedBy },
    select: { name: true },
  })

  return NextResponse.json({
    tripName: invite.trip.name,
    tripId: invite.trip.id,
    startDate: invite.trip.startDate,
    endDate: invite.trip.endDate,
    inviterName: inviter?.name || "你的朋友",
    email: invite.email,
  })
}
