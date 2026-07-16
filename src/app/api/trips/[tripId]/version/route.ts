import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { createTripVersion } from "@/lib/trip-version"

/**
 * 回傳行程交易資料的輕量版本指紋。
 *
 * 客戶端只在指紋變動時才抓完整行程，避免為了多人同步而固定下載所有交易。
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ tripId: string }> },
) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "未登入" }, { status: 401 })
  }

  const { tripId } = await params
  const trip = await prisma.trip.findFirst({
    where: {
      id: tripId,
      members: { some: { userId: session.user.id } },
    },
    select: {
      updatedAt: true,
      expenses: {
        select: { id: true, updatedAt: true },
        orderBy: { id: "asc" },
      },
      deposits: {
        select: {
          id: true,
          amount: true,
          currency: true,
          note: true,
          createdAt: true,
        },
        orderBy: { id: "asc" },
      },
      cashWallets: {
        select: { id: true, balance: true, updatedAt: true },
        orderBy: { id: "asc" },
      },
      cashExchanges: {
        select: {
          id: true,
          type: true,
          foreignCurrency: true,
          foreignAmount: true,
          baseAmount: true,
          exchangeRate: true,
          date: true,
          note: true,
          createdAt: true,
        },
        orderBy: { id: "asc" },
      },
    },
  })

  if (!trip) {
    return NextResponse.json({ error: "行程不存在或無權限" }, { status: 404 })
  }

  const version = createTripVersion(trip)

  return NextResponse.json(
    { version },
    {
      headers: {
        "Cache-Control": "private, no-store, max-age=0",
      },
    },
  )
}
