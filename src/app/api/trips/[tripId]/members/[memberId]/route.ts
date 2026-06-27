/**
 * 成員管理 API — 移除成員（僅 owner 可操作）
 */
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

// DELETE — 移除成員
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ tripId: string; memberId: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "未登入" }, { status: 401 })
  }

  const { tripId, memberId } = await params

  // 確認是 owner
  const owner = await prisma.tripMember.findUnique({
    where: { tripId_userId: { tripId, userId: session.user.id } },
  })
  if (!owner || owner.role !== "owner") {
    return NextResponse.json({ error: "僅擁有者可以移除成員" }, { status: 403 })
  }

  // 不能移除自己
  if (memberId === owner.id) {
    return NextResponse.json({ error: "無法移除自己" }, { status: 400 })
  }

  // 確認被移除的成員存在
  const target = await prisma.tripMember.findUnique({
    where: { id: memberId },
  })
  if (!target || target.tripId !== tripId) {
    return NextResponse.json({ error: "找不到此成員" }, { status: 404 })
  }

  await prisma.tripMember.delete({ where: { id: memberId } })
  return NextResponse.json({ success: true })
}
