/**
 * 收入 API
 */
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { z } from "zod"

const depositSchema = z.object({
  amount: z.number().positive("金額必須大於 0"),
  currency: z.string(),
  note: z.string().optional(),
})

// POST — 新增收入
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ tripId: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "未登入" }, { status: 401 })
  }

  const { tripId } = await params

  // 檢查權限
  const member = await prisma.tripMember.findUnique({
    where: { tripId_userId: { tripId, userId: session.user.id } },
  })
  if (!member || member.role === "viewer") {
    return NextResponse.json({ error: "無權限" }, { status: 403 })
  }

  try {
    const body = await req.json()
    const data = depositSchema.parse(body)

    const deposit = await prisma.deposit.create({
      data: {
        tripId,
        userId: session.user.id,
        amount: data.amount,
        currency: data.currency,
        note: data.note,
      },
      include: {
        user: { select: { id: true, name: true } },
      },
    })

    return NextResponse.json(deposit)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0].message }, { status: 400 })
    }
    console.error("Create deposit error:", error)
    return NextResponse.json({ error: "收入失敗" }, { status: 500 })
  }
}
