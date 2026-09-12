import { NextRequest, NextResponse } from "next/server"
import nodemailer from "nodemailer"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import {
  createTripCompletionSubject,
  formatTripCompletionDateRange,
  generateTripCompletionEmailHtml,
  normalizeTripCompletionRecipients,
  resolveTripCompletionBaseUrl,
} from "@/lib/trip-completion-email"

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD,
  },
})

export async function POST(
  _req: NextRequest,
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
      members: {
        some: {
          userId: session.user.id,
          role: "owner",
        },
      },
    },
    select: {
      id: true,
      name: true,
      startDate: true,
      endDate: true,
      members: {
        select: {
          user: {
            select: { email: true },
          },
        },
      },
    },
  })

  if (!trip) {
    return NextResponse.json({ error: "僅擁有者可以發送行程完成通知" }, { status: 403 })
  }

  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
    console.error("[TripCompletionEmail] Gmail SMTP is not configured")
    return NextResponse.json({ error: "Email 寄送服務尚未設定" }, { status: 503 })
  }

  const recipients = normalizeTripCompletionRecipients(
    trip.members.map((member) => member.user.email),
  )
  if (recipients.length === 0) {
    return NextResponse.json({ error: "目前沒有可通知的行程成員" }, { status: 400 })
  }

  const senderName = session.user.name || session.user.email || "行程擁有者"
  const tripUrl = `${resolveTripCompletionBaseUrl()}/trips/${trip.id}`
  const html = generateTripCompletionEmailHtml({
    tripName: trip.name,
    senderName,
    dateRange: formatTripCompletionDateRange(trip.startDate, trip.endDate),
    tripUrl,
  })

  const results = await Promise.allSettled(
    recipients.map((email) => transporter.sendMail({
      from: `"您的小銘子" <${process.env.GMAIL_USER}>`,
      to: email,
      subject: createTripCompletionSubject(trip.name),
      html,
    })),
  )
  const sentCount = results.filter((result) => result.status === "fulfilled").length
  const failedCount = results.length - sentCount

  if (sentCount === 0) {
    console.error("[TripCompletionEmail] All deliveries failed", { tripId, failedCount })
    return NextResponse.json({
      error: "完成通知寄送失敗，請稍後再試",
      sentCount,
      failedCount,
      totalCount: recipients.length,
    }, { status: 502 })
  }

  if (failedCount > 0) {
    console.error("[TripCompletionEmail] Partial delivery failure", { tripId, sentCount, failedCount })
  } else {
    console.log("[TripCompletionEmail] Sent", { tripId, sentCount })
  }

  return NextResponse.json({
    success: failedCount === 0,
    sentCount,
    failedCount,
    totalCount: recipients.length,
  })
}
