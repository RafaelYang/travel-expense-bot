/**
 * 邀請碼 API
 */
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { generateCode } from "@/lib/utils"

// POST — 產生邀請碼
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ tripId: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "未登入" }, { status: 401 })
  }

  const { tripId } = await params

  // 僅 owner 可產生邀請碼
  const member = await prisma.tripMember.findUnique({
    where: { tripId_userId: { tripId, userId: session.user.id } },
  })
  if (!member || member.role !== "owner") {
    return NextResponse.json({ error: "僅擁有者可以產生邀請碼" }, { status: 403 })
  }

  const code = generateCode(6)
  const expires = new Date()
  expires.setDate(expires.getDate() + 7) // 7 天有效

  const inviteCode = await prisma.inviteCode.create({
    data: {
      tripId,
      code,
      expires,
    },
  })

  return NextResponse.json(inviteCode)
}
