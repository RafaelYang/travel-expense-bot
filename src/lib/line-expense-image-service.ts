import "server-only"

import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { findLineEditableExpenseByLineUserId } from "@/lib/trip-access"

const MAX_LINE_IMAGE_BYTES = 5 * 1024 * 1024
const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"])

export class LineExpenseImageError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "LineExpenseImageError"
  }
}

export async function attachLineImageToExpense({
  lineUserId,
  expenseId,
  messageId,
}: {
  lineUserId: string
  expenseId: string
  messageId: string
}) {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN
  if (!token) {
    throw new LineExpenseImageError("伺服器尚未設定 LINE 圖片下載功能。")
  }

  const expense = await findLineEditableExpenseByLineUserId(lineUserId, expenseId)
  if (!expense) {
    throw new LineExpenseImageError("找不到可編輯的花費，或您已沒有此行程的編輯權限。")
  }

  const currentImages = Array.isArray(expense.images)
    ? expense.images.filter((image): image is string => typeof image === "string")
    : []

  if (currentImages.length >= 3) {
    throw new LineExpenseImageError(`花費【${expense.item}】的圖片已達上限（最多 3 張）。`)
  }

  const response = await fetch(`https://api-data.line.me/v2/bot/message/${encodeURIComponent(messageId)}/content`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(15_000),
  })

  if (!response.ok) {
    throw new Error(`LINE image download failed with HTTP ${response.status}`)
  }

  const declaredSize = Number(response.headers.get("content-length") || 0)
  if (declaredSize > MAX_LINE_IMAGE_BYTES) {
    throw new LineExpenseImageError("圖片超過 5 MB 上限，請壓縮後再傳送。")
  }

  const contentType = response.headers.get("content-type")?.split(";")[0].toLowerCase() || "image/jpeg"
  if (!ALLOWED_IMAGE_TYPES.has(contentType)) {
    throw new LineExpenseImageError("僅支援 JPEG、PNG 或 WebP 圖片。")
  }

  const buffer = Buffer.from(await response.arrayBuffer())
  if (buffer.byteLength > MAX_LINE_IMAGE_BYTES) {
    throw new LineExpenseImageError("圖片超過 5 MB 上限，請壓縮後再傳送。")
  }

  const updatedImages = [
    ...currentImages,
    `data:${contentType};base64,${buffer.toString("base64")}`,
  ]

  // 以原圖片陣列作為 optimistic concurrency guard，避免同時上傳時互相覆寫。
  const updated = await prisma.expense.updateMany({
    where: {
      id: expense.id,
      userId: expense.userId,
      images: { equals: currentImages as Prisma.InputJsonValue },
    },
    data: { images: updatedImages },
  })

  if (updated.count !== 1) {
    throw new LineExpenseImageError("圖片同時被其他請求更新，請再傳送一次。")
  }

  return {
    item: expense.item,
    amount: expense.amount,
    currency: expense.currency,
    imageCount: updatedImages.length,
  }
}
