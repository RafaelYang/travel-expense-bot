import { Prisma } from "@prisma/client"
import { type NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import { auth } from "@/lib/auth"
import {
  resolveCalendarTimeZone,
  VISITOR_TIME_ZONE_COOKIE,
  WRITABLE_TRIP_ROLES,
} from "@/lib/active-trip"
import { prisma } from "@/lib/prisma"
import { isCalendarDay } from "@/lib/recent-entry-date"
import {
  moveTimelineItem,
  parseTimelineItemKey,
  TimelineOrderError,
  timelineItemDateKey,
  timelineItemKey,
  type TimelineTransaction,
} from "@/lib/timeline-order"

const timelineKeySchema = z.string().max(220).refine(
  (value) => parseTimelineItemKey(value) !== null,
  "交易項目格式錯誤",
)

const moveSchema = z.object({
  activeKey: timelineKeySchema,
  overKey: timelineKeySchema,
  dateKey: z.string().refine(isCalendarDay, "日期格式錯誤"),
  timeZone: z.string().trim().min(1).max(100),
}).strict()

function responseError(error: string, status: number) {
  return NextResponse.json({ error }, { status })
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ tripId: string }> },
) {
  const session = await auth()
  if (!session?.user?.id) return responseError("未登入", 401)

  const parsedBody = moveSchema.safeParse(await request.json().catch(() => null))
  if (!parsedBody.success) {
    return responseError(parsedBody.error.issues[0]?.message || "排序資料格式錯誤", 400)
  }

  const { tripId } = await params
  const userId = session.user.id
  const member = await prisma.tripMember.findUnique({
    where: { tripId_userId: { tripId, userId } },
    select: {
      role: true,
      trip: {
        select: {
          timelineOrder: true,
          updatedAt: true,
          expenses: { select: { id: true, date: true, createdAt: true } },
          deposits: { select: { id: true, date: true, createdAt: true } },
          cashExchanges: { select: { id: true, date: true, createdAt: true } },
        },
      },
    },
  })

  if (!member || !WRITABLE_TRIP_ROLES.some((role) => role === member.role)) {
    return responseError("無調整順序權限", 403)
  }

  const items: TimelineTransaction[] = [
    ...member.trip.expenses.map((expense) => ({ ...expense, kind: "expense" as const })),
    ...member.trip.deposits.map((deposit) => ({ ...deposit, kind: "deposit" as const })),
    ...member.trip.cashExchanges.map((exchange) => ({ ...exchange, kind: "exchange" as const })),
  ]
  const deviceTimeZone = request.cookies.get(VISITOR_TIME_ZONE_COOKIE)?.value
  const timeZone = resolveCalendarTimeZone(
    parsedBody.data.timeZone,
    resolveCalendarTimeZone(
      deviceTimeZone,
      request.headers.get("x-vercel-ip-timezone"),
    ),
  )
  const { activeKey, overKey, dateKey } = parsedBody.data

  try {
    const active = items.find((item) => timelineItemKey(item.kind, item.id) === activeKey)
    const over = items.find((item) => timelineItemKey(item.kind, item.id) === overKey)
    if (!active || !over) {
      return responseError("交易項目無效", 400)
    }

    const authoritativeDay = timelineItemDateKey(active, timeZone)
    if (authoritativeDay !== dateKey || timelineItemDateKey(over, timeZone) !== dateKey) {
      return responseError("交易日期已變更，請重新整理後再試", 409)
    }

    const timelineOrder = moveTimelineItem(
      items,
      member.trip.timelineOrder,
      activeKey,
      overKey,
      timeZone,
    )
    const updated = await prisma.$transaction(async (transaction) => {
      const result = await transaction.trip.updateMany({
        where: {
          id: tripId,
          updatedAt: member.trip.updatedAt,
          members: {
            some: {
              userId,
              role: { in: [...WRITABLE_TRIP_ROLES] },
            },
          },
        },
        data: { timelineOrder: timelineOrder as Prisma.InputJsonValue },
      })
      if (result.count !== 1) return null

      return transaction.trip.findUnique({
        where: { id: tripId },
        select: { timelineOrder: true, updatedAt: true },
      })
    })
    if (!updated) {
      return responseError("旅程資料已更新，請重新整理後再試", 409)
    }

    return NextResponse.json({
      timelineOrder: updated.timelineOrder,
      updatedAt: updated.updatedAt,
    })
  } catch (error) {
    if (error instanceof TimelineOrderError) {
      return responseError(
        error.code === "different-day"
          ? "只能調整同一日期內的順序"
          : "交易項目無效",
        400,
      )
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      return responseError("無調整順序權限", 403)
    }
    throw error
  }
}
