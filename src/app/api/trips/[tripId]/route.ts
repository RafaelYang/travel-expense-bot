/**
 * 單一行程 API — 詳情 / 更新 / 刪除
 */
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

// GET — 取得行程詳情
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ tripId: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "未登入" }, { status: 401 })
  }

  const { tripId } = await params

  // 確認是行程成員
  const member = await prisma.tripMember.findUnique({
    where: { tripId_userId: { tripId, userId: session.user.id } },
  })
  if (!member) {
    return NextResponse.json({ error: "無權限查看此行程" }, { status: 403 })
  }

  const trip = await prisma.trip.findUnique({
    where: { id: tripId },
    include: {
      members: {
        include: { user: { select: { id: true, name: true, email: true, image: true } } },
      },
      expenses: {
        include: { user: { select: { id: true, name: true } } },
        orderBy: { date: 'desc' },
      },
      deposits: {
        include: { user: { select: { id: true, name: true } } },
        orderBy: { createdAt: 'desc' },
      },
    },
  })

  if (!trip) {
    return NextResponse.json({ error: "行程不存在" }, { status: 404 })
  }

  // 計算總花費
  const totalSpent = trip.expenses.reduce(
    (sum, e) => sum + (e.convertedAmount || e.amount),
    0
  )
  // 計算總收入
  const totalDeposits = trip.deposits.reduce((sum, d) => sum + d.amount, 0)

  return NextResponse.json({
    ...trip,
    totalSpent,
    totalDeposits,
    userRole: member.role,
  })
}

// PUT — 更新行程
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ tripId: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "未登入" }, { status: 401 })
  }

  const { tripId } = await params

  // 僅 owner 可修改
  const member = await prisma.tripMember.findUnique({
    where: { tripId_userId: { tripId, userId: session.user.id } },
  })
  if (!member || member.role !== "owner") {
    return NextResponse.json({ error: "僅擁有者可以修改行程" }, { status: 403 })
  }

  const body = await req.json()
  const trip = await prisma.trip.update({
    where: { id: tripId },
    data: {
      name: body.name,
      description: body.description,
      startDate: body.startDate ? new Date(body.startDate) : undefined,
      endDate: body.endDate ? new Date(body.endDate) : undefined,
      defaultCurrency: body.defaultCurrency,
      baseCurrency: body.baseCurrency,
      budgetAmount: body.budgetAmount,
      status: body.status,
    },
  })

  return NextResponse.json(trip)
}

// DELETE — 刪除行程
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ tripId: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "未登入" }, { status: 401 })
  }

  const { tripId } = await params

  const member = await prisma.tripMember.findUnique({
    where: { tripId_userId: { tripId, userId: session.user.id } },
  })
  if (!member || member.role !== "owner") {
    return NextResponse.json({ error: "僅擁有者可以刪除行程" }, { status: 403 })
  }

  await prisma.trip.delete({ where: { id: tripId } })
  return NextResponse.json({ success: true })
}
