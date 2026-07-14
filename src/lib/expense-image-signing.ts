import { createHmac, timingSafeEqual } from "crypto"

const DEFAULT_TTL_SECONDS = 60 * 60
export const WEB_IMAGE_TTL_SECONDS = 24 * 60 * 60
const EXPENSE_IMAGE_PATH_PREFIX = "/api/trips/expenses/images/"
const DATA_IMAGE_PATTERN = /^data:image\/(?:jpeg|png|webp|gif);base64,[a-z0-9+/=]+$/i

function getSigningSecret(explicitSecret?: string): string {
  const secret = explicitSecret
    || process.env.IMAGE_URL_SIGNING_SECRET
    || process.env.AUTH_SECRET
    || process.env.LINE_CHANNEL_SECRET

  if (!secret) {
    throw new Error("缺少圖片網址簽名密鑰")
  }

  return secret
}

function signaturePayload(expenseId: string, index: number, expires: number) {
  return `${expenseId}:${index}:${expires}`
}

export function signExpenseImageAccess(
  expenseId: string,
  index: number,
  expires: number,
  explicitSecret?: string,
) {
  return createHmac("sha256", getSigningSecret(explicitSecret))
    .update(signaturePayload(expenseId, index, expires))
    .digest("hex")
}

export function verifyExpenseImageAccess(
  expenseId: string,
  index: number,
  expires: number,
  signature: string,
  nowSeconds = Math.floor(Date.now() / 1000),
  explicitSecret?: string,
) {
  if (!Number.isInteger(index) || index < 0 || index > 2) return false
  if (!Number.isInteger(expires) || expires < nowSeconds) return false
  if (!/^[a-f0-9]{64}$/i.test(signature)) return false

  const expected = signExpenseImageAccess(expenseId, index, expires, explicitSecret)
  return timingSafeEqual(Buffer.from(signature, "hex"), Buffer.from(expected, "hex"))
}

export function createSignedExpenseImagePath(
  expenseId: string,
  index: number,
  ttlSeconds = DEFAULT_TTL_SECONDS,
  explicitSecret?: string,
) {
  const expires = Math.floor(Date.now() / 1000) + ttlSeconds
  const signature = signExpenseImageAccess(expenseId, index, expires, explicitSecret)
  const params = new URLSearchParams({
    index: String(index),
    expires: String(expires),
    signature,
  })

  return `${EXPENSE_IMAGE_PATH_PREFIX}${encodeURIComponent(expenseId)}?${params}`
}

/**
 * 只把限時簽名參照傳給瀏覽器，避免 Base64 圖片進入 RSC/JSON payload。
 * 圖片仍可保持在現有 JSON 欄位，因此不需要資料庫遷移。
 */
export function createSignedExpenseImagePaths(
  expenseId: string,
  images: unknown,
  ttlSeconds = WEB_IMAGE_TTL_SECONDS,
  explicitSecret?: string,
) {
  if (!Array.isArray(images)) return []

  return images.slice(0, 3).flatMap((image, index) => (
    typeof image === "string" && image.length > 0
      ? [createSignedExpenseImagePath(expenseId, index, ttlSeconds, explicitSecret)]
      : []
  ))
}

/**
 * 編輯時，前端回傳的舊圖是簽名參照，新圖才是 Data URL。
 * 這裡將舊圖安全還原為資料庫原值，防止把會過期的 URL 寫回資料庫。
 */
export function resolveExpenseImageInputs(
  expenseId: string,
  storedImages: unknown,
  inputs: string[],
  nowSeconds = Math.floor(Date.now() / 1000),
  explicitSecret?: string,
): string[] | null {
  if (!Array.isArray(storedImages) || inputs.length > 3) return inputs.length === 0 ? [] : null

  const resolved: string[] = []

  for (const input of inputs) {
    if (DATA_IMAGE_PATTERN.test(input)) {
      resolved.push(input)
      continue
    }

    let url: URL
    try {
      url = new URL(input, "http://expense-images.local")
    } catch {
      return null
    }

    const expectedPath = `${EXPENSE_IMAGE_PATH_PREFIX}${encodeURIComponent(expenseId)}`
    if (url.pathname !== expectedPath) return null

    const index = Number(url.searchParams.get("index"))
    const expires = Number(url.searchParams.get("expires"))
    const signature = url.searchParams.get("signature") || ""
    if (!verifyExpenseImageAccess(expenseId, index, expires, signature, nowSeconds, explicitSecret)) {
      return null
    }

    const storedImage = storedImages[index]
    if (typeof storedImage !== "string" || storedImage.length === 0) return null
    resolved.push(storedImage)
  }

  return resolved
}

export function getPublicAppOrigin() {
  const configured = process.env.NEXTAUTH_URL
    || process.env.VERCEL_PROJECT_PRODUCTION_URL
    || process.env.VERCEL_URL
    || "https://travel-expense-bot-steel.vercel.app"

  return configured.startsWith("http") ? configured : `https://${configured}`
}
