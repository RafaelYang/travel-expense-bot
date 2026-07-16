import { prisma } from "@/lib/prisma"
import { summarizeTripSpending } from "@/lib/money"

export interface DashboardTrip {
  id: string
  name: string
  description?: string
  startDate: string
  endDate: string
  defaultCurrency: string
  baseCurrency: string
  budgetAmount?: number
  status: string
  countries: string[]
  coverImage?: string
  totalSpent: number
  missingConversionCount: number
  members: { user: { id: string; name: string; image?: string } }[]
  _count: { expenses: number }
}

/**
 * 取得首頁需要的精簡行程資料。
 *
 * 這個查詢同時供 Server Component 與相容用的 GET API 使用，避免首頁先完成
 * hydration 後再多打一個 HTTP round trip。
 */
export async function getTripDashboard(userId: string): Promise<DashboardTrip[]> {
  const trips = await prisma.trip.findMany({
    where: {
      members: { some: { userId } },
    },
    select: {
      id: true,
      name: true,
      description: true,
      startDate: true,
      endDate: true,
      defaultCurrency: true,
      baseCurrency: true,
      budgetAmount: true,
      status: true,
      countries: true,
      coverImage: true,
      members: {
        select: {
          user: { select: { id: true, name: true, image: true } },
        },
      },
      _count: { select: { expenses: true } },
    },
    orderBy: { startDate: "desc" },
  })

  const expenseAmounts = trips.length > 0
    ? await prisma.expense.findMany({
        where: { tripId: { in: trips.map((trip) => trip.id) } },
        select: {
          tripId: true,
          amount: true,
          currency: true,
          convertedAmount: true,
          paymentMethod: true,
        },
      })
    : []

  const cashExchanges = trips.length > 0
    ? await prisma.cashExchange.findMany({
        where: { tripId: { in: trips.map((trip) => trip.id) } },
        select: { tripId: true, type: true, baseAmount: true },
      })
    : []

  const expensesByTrip = new Map<string, typeof expenseAmounts>()
  for (const expense of expenseAmounts) {
    const group = expensesByTrip.get(expense.tripId) ?? []
    group.push(expense)
    expensesByTrip.set(expense.tripId, group)
  }

  const exchangesByTrip = new Map<string, typeof cashExchanges>()
  for (const exchange of cashExchanges) {
    const group = exchangesByTrip.get(exchange.tripId) ?? []
    group.push(exchange)
    exchangesByTrip.set(exchange.tripId, group)
  }

  return trips.map((trip) => {
    const summary = summarizeTripSpending(
      expensesByTrip.get(trip.id) ?? [],
      exchangesByTrip.get(trip.id) ?? [],
      trip.baseCurrency,
    )

    return {
      id: trip.id,
      name: trip.name,
      description: trip.description ?? undefined,
      startDate: trip.startDate.toISOString(),
      endDate: trip.endDate.toISOString(),
      defaultCurrency: trip.defaultCurrency,
      baseCurrency: trip.baseCurrency,
      budgetAmount: trip.budgetAmount ?? undefined,
      status: trip.status,
      countries: trip.countries,
      coverImage: trip.coverImage ?? undefined,
      totalSpent: summary.total,
      missingConversionCount: summary.missingConversionCount,
      members: trip.members.map((member) => ({
        user: {
          id: member.user.id,
          name: member.user.name ?? "",
          image: member.user.image ?? undefined,
        },
      })),
      _count: trip._count,
    }
  })
}
