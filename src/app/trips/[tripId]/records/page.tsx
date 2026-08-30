import { redirect } from "next/navigation"

import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

import RecordsClient, { type RecordsTripData } from "./records-client"

export default async function TripRecordsPage({
  params,
}: {
  params: Promise<{ tripId: string }>
}) {
  const session = await auth()
  if (!session?.user?.id) redirect("/login")

  const { tripId } = await params
  const trip = await prisma.trip.findFirst({
    where: {
      id: tripId,
      members: { some: { userId: session.user.id } },
    },
    select: {
      id: true,
      name: true,
      baseCurrency: true,
      serviceFeeEnabled: true,
      shopbackRewardEnabled: true,
      creditCardRewardEnabled: true,
      members: {
        where: { userId: session.user.id },
        select: { role: true },
      },
      expenses: {
        select: {
          id: true,
          item: true,
          amount: true,
          currency: true,
          convertedAmount: true,
          settledAmount: true,
          serviceFee: true,
          shopbackReward: true,
          creditCardReward: true,
          date: true,
          createdAt: true,
          paymentMethod: true,
          reconciledAt: true,
          user: { select: { name: true } },
        },
        orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      },
      deposits: {
        select: {
          id: true,
          amount: true,
          currency: true,
          note: true,
          date: true,
          createdAt: true,
          user: { select: { name: true } },
        },
        orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      },
      cashExchanges: {
        select: {
          id: true,
          type: true,
          foreignCurrency: true,
          foreignAmount: true,
          baseAmount: true,
          date: true,
          createdAt: true,
          user: { select: { name: true } },
        },
        orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      },
    },
  })

  if (!trip || !trip.members[0]) redirect("/")

  const serializedTrip: RecordsTripData = {
    id: trip.id,
    name: trip.name,
    baseCurrency: trip.baseCurrency,
    serviceFeeEnabled: trip.serviceFeeEnabled,
    shopbackRewardEnabled: trip.shopbackRewardEnabled,
    creditCardRewardEnabled: trip.creditCardRewardEnabled,
    userRole: trip.members[0].role,
    expenses: trip.expenses.map((expense) => ({
      ...expense,
      convertedAmount: expense.convertedAmount ?? undefined,
      settledAmount: expense.settledAmount ?? undefined,
      paymentMethod: expense.paymentMethod === "cash" ? "cash" : "card",
      date: expense.date.toISOString(),
      createdAt: expense.createdAt.toISOString(),
      reconciledAt: expense.reconciledAt?.toISOString(),
      user: { name: expense.user.name ?? "" },
    })),
    deposits: trip.deposits.map((deposit) => ({
      ...deposit,
      note: deposit.note ?? undefined,
      date: deposit.date.toISOString(),
      createdAt: deposit.createdAt.toISOString(),
      user: { name: deposit.user.name ?? "" },
    })),
    cashExchanges: trip.cashExchanges.map((exchange) => ({
      ...exchange,
      type: exchange.type === "sell" ? "sell" : "buy",
      date: exchange.date.toISOString(),
      createdAt: exchange.createdAt.toISOString(),
      user: { name: exchange.user.name ?? "" },
    })),
  }

  return <RecordsClient initialTrip={serializedTrip} />
}
