import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import { auth } from "@/lib/auth"
import {
  creditCashWallet,
  debitCashWallet,
  InsufficientCashBalanceError,
} from "@/lib/cash-wallet"
import { prisma } from "@/lib/prisma"

const exchangeSchema = z.object({
  type: z.enum(["buy", "sell"]),
  foreignCurrency: z.string().trim().regex(/^[A-Za-z]{3}$/).transform((value) => value.toUpperCase()),
  foreignAmount: z.number().positive(),
  baseAmount: z.number().positive(),
  date: z.string().datetime().optional(),
  note: z.string().trim().max(1_000).optional(),
})

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ tripId: string }> },
) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "未登入" }, { status: 401 })
  }

  const { tripId } = await params
  const member = await prisma.tripMember.findUnique({
    where: { tripId_userId: { tripId, userId: session.user.id } },
    include: { trip: { select: { baseCurrency: true } } },
  })
  if (!member || member.role === "viewer") {
    return NextResponse.json({ error: "無換匯權限" }, { status: 403 })
  }

  try {
    const data = exchangeSchema.parse(await req.json())
    const baseCurrency = member.trip.baseCurrency.toUpperCase()
    if (data.foreignCurrency === baseCurrency) {
      return NextResponse.json({ error: "外幣不可與旅程基準幣別相同" }, { status: 400 })
    }

    const result = await prisma.$transaction(async (tx) => {
      const walletInput = {
        tripId,
        userId: session.user.id,
        currency: data.foreignCurrency,
        amount: data.foreignAmount,
      }
      const wallet = data.type === "buy"
        ? await creditCashWallet(tx, walletInput)
        : await debitCashWallet(tx, walletInput)

      const exchange = await tx.cashExchange.create({
        data: {
          tripId,
          userId: session.user.id,
          type: data.type,
          foreignCurrency: data.foreignCurrency,
          foreignAmount: data.foreignAmount,
          baseAmount: data.baseAmount,
          exchangeRate: data.baseAmount / data.foreignAmount,
          date: data.date ? new Date(data.date) : new Date(),
          note: data.note || null,
        },
        include: { user: { select: { id: true, name: true } } },
      })

      return { exchange, wallet }
    })

    return NextResponse.json({
      ...result,
      totalSpentDelta: data.type === "buy" ? data.baseAmount : -data.baseAmount,
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0].message }, { status: 400 })
    }
    if (error instanceof InsufficientCashBalanceError) {
      return NextResponse.json({ error: error.message }, { status: 409 })
    }
    console.error("Create cash exchange error:", error)
    return NextResponse.json({ error: "換匯記錄新增失敗" }, { status: 500 })
  }
}
