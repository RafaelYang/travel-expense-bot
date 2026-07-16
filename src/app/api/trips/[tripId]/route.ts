/**
 * 單一行程 API — 詳情 / 更新 / 刪除
 */
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { summarizeDeposits, summarizeTripSpending } from "@/lib/money"
import { createSignedExpenseImagePaths } from "@/lib/expense-image-signing"
import { createTripVersion } from "@/lib/trip-version"

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
      cashWallets: {
        orderBy: { currency: 'asc' },
      },
      cashExchanges: {
        include: { user: { select: { id: true, name: true } } },
        orderBy: { date: 'desc' },
      },
    },
  })

  if (!trip) {
    return NextResponse.json({ error: "行程不存在" }, { status: 404 })
  }

  const expenseSummary = summarizeTripSpending(
    trip.expenses,
    trip.cashExchanges,
    trip.baseCurrency,
  )
  const depositSummary = summarizeDeposits(trip.deposits, trip.baseCurrency)

  return NextResponse.json({
    ...trip,
    expenses: trip.expenses.map((expense) => ({
      ...expense,
      images: createSignedExpenseImagePaths(expense.id, expense.images),
    })),
    cashWallets: trip.cashWallets.filter((wallet) => wallet.userId === session.user.id),
    totalSpent: expenseSummary.total,
    exchangeNet: expenseSummary.exchangeNet,
    totalDeposits: depositSummary.total,
    missingConversionCount: expenseSummary.missingConversionCount,
    foreignCurrencyDepositCount: depositSummary.foreignCurrencyCount,
    userRole: member.role,
    currentUserId: session.user.id,
    realtimeVersion: createTripVersion({
      updatedAt: trip.updatedAt,
      expenses: trip.expenses.map((expense) => ({
        id: expense.id,
        updatedAt: expense.updatedAt,
      })),
      deposits: trip.deposits.map((deposit) => ({
        id: deposit.id,
        amount: deposit.amount,
        currency: deposit.currency,
        note: deposit.note,
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
  let countriesPayload = body.countries
  if (typeof countriesPayload === "string") {
    countriesPayload = [countriesPayload]
  }

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
      countries: countriesPayload,
      coverImage: body.coverImage === "" ? null : body.coverImage,
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
