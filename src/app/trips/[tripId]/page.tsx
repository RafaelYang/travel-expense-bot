/**
 * 行程主頁 Server Component — 伺服器端資料載入 (SSR)
 * 
 * 優勢：
 * 1. 網頁加載時，直接在伺服器端查詢資料庫並渲染出 HTML，免除客戶端 CSR Loading 的白屏等待。
 * 2. 獲取資料速度提升數倍，達到秒開的極致體驗。
 */
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { redirect, notFound } from "next/navigation"
import { cookies, headers } from "next/headers"
import TripDetailClient, { type TripData } from "./trip-detail-client"
import { summarizeDeposits, summarizeTripSpending } from "@/lib/money"
import { createSignedExpenseImagePathsFromCount } from "@/lib/expense-image-signing"
import { getExpenseImageCounts } from "@/lib/expense-image-metadata"
import { createTripVersion } from "@/lib/trip-version"
import {
  getCalendarDayKey,
  resolveCalendarTimeZone,
  VISITOR_TIME_ZONE_COOKIE,
} from "@/lib/active-trip"

export default async function TripPage({ params }: { params: Promise<{ tripId: string }> }) {
  const session = await auth()
  if (!session?.user?.id) {
    redirect("/login")
  }

  const [{ tripId }, requestHeaders, cookieStore] = await Promise.all([
    params,
    headers(),
    cookies(),
  ])
  const initialCalendarDay = getCalendarDayKey(
    new Date(),
    resolveCalendarTimeZone(
      cookieStore.get(VISITOR_TIME_ZONE_COOKIE)?.value,
      requestHeaders.get("x-vercel-ip-timezone"),
    ),
  )

  // 1. 以成員條件直接撈取完整行程，省去先查權限再查行程的資料庫往返。
  const [trip, expenseImageCounts] = await Promise.all([
    prisma.trip.findFirst({
      where: {
        id: tripId,
        members: { some: { userId: session.user.id } },
      },
      include: {
        members: {
          include: { user: { select: { id: true, name: true, email: true, image: true } } },
        },
        expenses: {
          omit: { images: true },
          include: { user: { select: { id: true, name: true } } },
          orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
        },
        deposits: {
          include: { user: { select: { id: true, name: true } } },
          orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
        },
        cashWallets: {
          orderBy: { currency: 'asc' },
        },
        cashExchanges: {
          include: { user: { select: { id: true, name: true } } },
          orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
        },
      },
    }),
    getExpenseImageCounts(tripId, session.user.id),
  ])

  if (!trip) {
    redirect("/")
  }

  const member = trip.members.find((candidate) => candidate.userId === session.user.id)
  if (!member) notFound()

  // 2. 計算總支出與總收入
  const expenseSummary = summarizeTripSpending(
    trip.expenses,
    trip.cashExchanges,
    trip.baseCurrency,
  )
  const depositSummary = summarizeDeposits(trip.deposits, trip.baseCurrency)

  // 3. 手動序列化為 React 伺服器傳送給客戶端元件所允許的純資料格式 (Plain JSON with ISO Strings)
  const serializedTrip = {
    id: trip.id,
    name: trip.name,
    description: trip.description || undefined,
    startDate: trip.startDate.toISOString(),
    endDate: trip.endDate.toISOString(),
    defaultCurrency: trip.defaultCurrency,
    baseCurrency: trip.baseCurrency,
    countries: trip.countries,
    budgetAmount: trip.budgetAmount || undefined,
    status: trip.status,
    coverImage: trip.coverImage || undefined,
    timelineOrder: trip.timelineOrder,
    createdAt: trip.createdAt.toISOString(),
    updatedAt: trip.updatedAt.toISOString(),
    realtimeVersion: createTripVersion({
      updatedAt: trip.updatedAt,
      timelineOrder: trip.timelineOrder,
      expenses: trip.expenses.map((expense) => ({
        id: expense.id,
        createdAt: expense.createdAt,
        updatedAt: expense.updatedAt,
      })),
      deposits: trip.deposits.map((deposit) => ({
        id: deposit.id,
        amount: deposit.amount,
        currency: deposit.currency,
        note: deposit.note,
        date: deposit.date,
        createdAt: deposit.createdAt,
      })),
      cashWallets: trip.cashWallets.map((wallet) => ({
        id: wallet.id,
        balance: wallet.balance,
        updatedAt: wallet.updatedAt,
      })),
      cashExchanges: trip.cashExchanges.map((exchange) => ({
        id: exchange.id,
        type: exchange.type,
        foreignCurrency: exchange.foreignCurrency,
        foreignAmount: exchange.foreignAmount,
        baseAmount: exchange.baseAmount,
        exchangeRate: exchange.exchangeRate,
        date: exchange.date,
        note: exchange.note,
        createdAt: exchange.createdAt,
      })),
    }),
    totalSpent: expenseSummary.total,
    exchangeNet: expenseSummary.exchangeNet,
    totalDeposits: depositSummary.total,
    missingConversionCount: expenseSummary.missingConversionCount,
    foreignCurrencyDepositCount: depositSummary.foreignCurrencyCount,
    userRole: member.role,
    currentUserId: session.user.id,
    members: trip.members.map(m => ({
      id: m.id,
      role: m.role,
      user: {
        id: m.user.id,
        name: m.user.name,
        email: m.user.email,
        image: m.user.image || undefined,
      }
    })),
    expenses: trip.expenses.map(e => ({
      id: e.id,
      category: e.category,
      item: e.item,
      amount: e.amount,
      currency: e.currency,
      convertedAmount: e.convertedAmount || undefined,
      exchangeRate: e.exchangeRate || undefined,
      settledAmount: e.settledAmount ?? undefined,
      reconciledAt: e.reconciledAt?.toISOString(),
      date: e.date.toISOString(),
      createdAt: e.createdAt.toISOString(),
      note: e.note || undefined,
      images: createSignedExpenseImagePathsFromCount(
        e.id,
        expenseImageCounts.get(e.id) ?? 0,
      ),
      source: e.source,
      paymentMethod: e.paymentMethod,
      user: {
        id: e.user.id,
        name: e.user.name,
      }
    })),
    deposits: trip.deposits.map(d => ({
      id: d.id,
      amount: d.amount,
      currency: d.currency,
      note: d.note || undefined,
      date: d.date.toISOString(),
      createdAt: d.createdAt.toISOString(),
      user: {
        id: d.user.id,
        name: d.user.name,
      }
    })),
    cashWallets: trip.cashWallets.filter(wallet => wallet.userId === session.user.id).map(wallet => ({
      id: wallet.id,
      currency: wallet.currency,
      balance: wallet.balance,
      updatedAt: wallet.updatedAt.toISOString(),
    })),
    cashExchanges: trip.cashExchanges.map(exchange => ({
      id: exchange.id,
      type: exchange.type,
      foreignCurrency: exchange.foreignCurrency,
      foreignAmount: exchange.foreignAmount,
      baseAmount: exchange.baseAmount,
      exchangeRate: exchange.exchangeRate,
      date: exchange.date.toISOString(),
      createdAt: exchange.createdAt.toISOString(),
      note: exchange.note || undefined,
      user: {
        id: exchange.user.id,
        name: exchange.user.name,
      },
    })),
  }

  return (
    <TripDetailClient
      initialData={serializedTrip as TripData}
      tripId={tripId}
      initialCalendarDay={initialCalendarDay}
    />
  )
}
