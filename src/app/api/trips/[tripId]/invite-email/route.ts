/**
 * Email 邀請 API — 寄送行程邀請信給指定 Email
 * 使用 Nodemailer + Gmail SMTP
 */
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import nodemailer from "nodemailer"
import { randomUUID } from "crypto"

// Gmail SMTP transporter
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD,
  },
})

// POST — 發送 Email 邀請
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ tripId: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "未登入" }, { status: 401 })
  }

  const { tripId } = await params

  try {
    const body = await req.json()
    const email = body.email?.trim()?.toLowerCase()

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: "請輸入有效的 Email" }, { status: 400 })
    }

    // 驗證權限（owner 或 member 可以邀請）
    const member = await prisma.tripMember.findUnique({
      where: { tripId_userId: { tripId, userId: session.user.id } },
    })
    if (!member || member.role === "viewer") {
      return NextResponse.json({ error: "沒有邀請權限" }, { status: 403 })
    }

    // 查詢行程資訊
    const trip = await prisma.trip.findUnique({
      where: { id: tripId },
    })
    if (!trip) {
      return NextResponse.json({ error: "行程不存在" }, { status: 404 })
    }

    // 檢查對方是否已是成員
    const existingUser = await prisma.user.findUnique({ where: { email } })
    if (existingUser) {
      const existingMember = await prisma.tripMember.findUnique({
        where: { tripId_userId: { tripId, userId: existingUser.id } },
      })
      if (existingMember) {
        return NextResponse.json({ error: "對方已經是此行程的成員" }, { status: 400 })
      }
    }

    // 檢查是否已有未過期的邀請
    const existingInvite = await prisma.emailInvite.findFirst({
      where: {
        tripId,
        email,
        status: "pending",
        expires: { gt: new Date() },
      },
    })

    // 建立邀請 token（若已有則重用）
    const token = existingInvite?.token || randomUUID()
    const expires = new Date()
    expires.setDate(expires.getDate() + 7) // 7 天有效

    if (!existingInvite) {
      await prisma.emailInvite.create({
        data: {
          tripId,
          email,
          token,
          invitedBy: session.user.id,
          expires,
        },
      })
    }

    // 組合邀請連結（強制用 production URL，避免 .env 中 localhost 問題）
    const baseUrl = process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL}`
      : (process.env.NEXTAUTH_URL || "https://travel-expense-bot-steel.vercel.app")
    const inviteUrl = `${baseUrl}/invite/accept?token=${token}`
    const inviterName = session.user.name || session.user.email || "你的朋友"

    // 日期格式化
    const startDate = new Date(trip.startDate)
    const endDate = new Date(trip.endDate)
    const dateRange = `${startDate.getMonth() + 1}/${startDate.getDate()} - ${endDate.getMonth() + 1}/${endDate.getDate()}`

    // 寄送 Email
    await transporter.sendMail({
      from: `"您的小銘子" <${process.env.GMAIL_USER}>`,
      to: email,
      subject: `${inviterName} 邀請你加入「${trip.name}」行程記帳`,
      html: generateInviteEmailHtml({
        tripName: trip.name,
        inviterName,
        dateRange,
        inviteUrl,
      }),
    })

    console.log("[EmailInvite] Sent to:", email)
    return NextResponse.json({ success: true, message: "邀請已寄出" })
  } catch (error) {
    console.error("[EmailInvite] Error:", error)
    return NextResponse.json({
      error: `寄送失敗：${error instanceof Error ? error.message : String(error)}`,
    }, { status: 500 })
  }
}

// === Email HTML 模板（淺色清爽風格）===
function generateInviteEmailHtml({
  tripName,
  inviterName,
  dateRange,
  inviteUrl,
}: {
  tripName: string
  inviterName: string
  dateRange: string
  inviteUrl: string
}) {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f0f4f8;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f0f4f8; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 480px; background: #ffffff; border-radius: 20px; box-shadow: 0 4px 24px rgba(0,0,0,0.08); overflow: hidden;">
          
          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #43b4e4, #38a3d1, #5cc6f0); padding: 36px 24px; text-align: center;">
              <div style="font-size: 36px; margin-bottom: 10px;">✈️</div>
              <h1 style="margin: 0; font-size: 22px; font-weight: 800; color: #ffffff; letter-spacing: -0.02em;">
                你被邀請加入行程
              </h1>
            </td>
          </tr>

          <!-- Content -->
          <tr>
            <td style="padding: 32px 28px;">
              <!-- 邀請人 -->
              <p style="margin: 0 0 24px; font-size: 15px; color: #64748b; line-height: 1.7;">
                <strong style="color: #1e293b;">${inviterName}</strong> 邀請你一起記錄旅行花費
              </p>

              <!-- 行程資訊卡片 -->
              <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 14px; padding: 20px; margin-bottom: 28px;">
                <div style="font-size: 18px; font-weight: 700; color: #1e293b; margin-bottom: 8px;">
                  ${tripName}
                </div>
                <div style="font-size: 13px; color: #94a3b8;">
                  📅 ${dateRange}
                </div>
              </div>

              <!-- CTA 按鈕 -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center">
                    <a href="${inviteUrl}" style="display: inline-block; background: linear-gradient(135deg, #38a3d1, #2b8db8); color: #ffffff; text-decoration: none; font-size: 16px; font-weight: 700; padding: 14px 44px; border-radius: 14px; letter-spacing: 0.02em; box-shadow: 0 4px 12px rgba(56,163,209,0.3);">
                      加入行程 →
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 0 28px 28px; text-align: center;">
              <p style="margin: 0; font-size: 12px; color: #94a3b8; line-height: 1.7;">
                這封邀請 7 天內有效。<br>
                點擊按鈕後用 Google 帳號登入即可加入。
              </p>
              <div style="margin-top: 16px; padding-top: 16px; border-top: 1px solid #e2e8f0;">
                <span style="font-size: 12px; color: #94a3b8;">
                  ✈️ 您的小銘子
                </span>
              </div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim()
}
