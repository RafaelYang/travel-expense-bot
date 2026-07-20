/**
 * 單筆收入 API — 編輯 / 刪除
 */
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { findEditableDeposit } from "@/lib/trip-access"
import { z } from "zod"

const updateSchema = z.object({
  amount: z.number().positive("金額必須大於 0").optional(),
  currency: z.string().optional(),
  note: z.string().optional().nullable(),
  date: z.string().optional(),
})

// PATCH — 編輯收入
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ tripId: string; depositId: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "未登入" }, { status: 401 })
  }

  const { tripId, depositId } = await params

  const existing = await findEditableDeposit(session.user.id, tripId, depositId)
  if (!existing) {
    return NextResponse.json({ error: "找不到此筆收入或無編輯權限" }, { status: 404 })
  }

  try {
    const body = await req.json()
    const data = updateSchema.parse(body)

    const updateData: Record<string, unknown> = {
      amount: data.amount,
      currency: data.currency,
      note: data.note,
    }

    if (data.date) {
      updateData.date = new Date(data.date)
    }

    const deposit = await prisma.deposit.update({
      where: { id: depositId, tripId },
      data: updateData,
      include: {
        user: { select: { id: true, name: true } },
      },
    })

    return NextResponse.json(deposit)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0].message }, { status: 400 })
    }
    console.error("Update deposit error:", error)
    return NextResponse.json({ error: "更新失敗" }, { status: 500 })
  }
}

// DELETE — 刪除收入
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ tripId: string; depositId: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "未登入" }, { status: 401 })
  }

  const { tripId, depositId } = await params

  const existing = await findEditableDeposit(session.user.id, tripId, depositId)
  if (!existing) {
    return NextResponse.json({ error: "找不到此筆收入或無刪除權限" }, { status: 404 })
  }

  try {
    await prisma.deposit.delete({
      where: { id: depositId, tripId },
    })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Delete deposit error:", error)
    return NextResponse.json({ error: "刪除失敗" }, { status: 500 })
  }
}
