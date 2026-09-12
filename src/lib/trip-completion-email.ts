export interface TripCompletionEmailInput {
  tripName: string
  senderName: string
  dateRange: string
  tripUrl: string
}

export function normalizeTripCompletionRecipients(emails: readonly string[]) {
  return [...new Set(
    emails
      .map((email) => email.trim().toLowerCase())
      .filter((email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email)),
  )]
}

export function formatTripCompletionDateRange(startDate: Date, endDate: Date) {
  const format = (date: Date) => `${date.getUTCFullYear()}/${date.getUTCMonth() + 1}/${date.getUTCDate()}`
  return `${format(startDate)}－${format(endDate)}`
}

export function resolveTripCompletionBaseUrl() {
  const configuredUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL
    || process.env.NEXTAUTH_URL
    || process.env.VERCEL_URL
    || "travel-expense-bot-steel.vercel.app"
  const url = /^https?:\/\//iu.test(configuredUrl)
    ? configuredUrl
    : `https://${configuredUrl}`
  return url.replace(/\/$/u, "")
}

export function createTripCompletionSubject(tripName: string) {
  const safeName = tripName.replace(/[\r\n]+/gu, " ").trim() || "旅程"
  return `「${safeName}」行程資料已整理完成`
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/gu, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  })[character] ?? character)
}

export function generateTripCompletionEmailHtml({
  tripName,
  senderName,
  dateRange,
  tripUrl,
}: TripCompletionEmailInput) {
  const safeTripName = escapeHtml(tripName)
  const safeSenderName = escapeHtml(senderName)
  const safeDateRange = escapeHtml(dateRange)
  const safeTripUrl = escapeHtml(tripUrl)

  return `
<!DOCTYPE html>
<html lang="zh-Hant">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background-color:#f1f5f9;color:#0f172a;">
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background-color:#f1f5f9;padding:32px 16px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="max-width:520px;background:#ffffff;border:1px solid #dbe5ef;border-radius:18px;overflow:hidden;">
          <tr>
            <td style="padding:28px 28px 16px;">
              <div style="font-size:13px;font-weight:700;color:#0284c7;margin-bottom:12px;">✓ 行程資料已整理完成</div>
              <h1 style="margin:0;font-size:24px;line-height:1.35;color:#0f172a;">${safeTripName}</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:0 28px 28px;">
              <p style="margin:0 0 18px;font-size:15px;line-height:1.75;color:#475569;">
                <strong style="color:#0f172a;">${safeSenderName}</strong> 已完成這趟行程的資料整理，邀請你查看目前的行程與收支內容。
              </p>
              <div style="padding:16px 18px;margin-bottom:22px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;font-size:14px;color:#475569;">
                📅 ${safeDateRange}
              </div>
              <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
                <tr>
                  <td align="center">
                    <a href="${safeTripUrl}" style="display:inline-block;padding:13px 30px;border-radius:10px;background:#0284c7;color:#ffffff;text-decoration:none;font-size:15px;font-weight:700;">查看行程</a>
                  </td>
                </tr>
              </table>
              <p style="margin:22px 0 0;font-size:12px;line-height:1.7;color:#94a3b8;text-align:center;">
                這是完成通知，不會鎖定行程；具有編輯權限的成員之後仍可更新內容。
              </p>
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
