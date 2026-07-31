import "server-only"

import { prisma } from "@/lib/prisma"

interface ExpenseImageCountRow {
  id: string
  imageCount: number
}

/**
 * 只在資料庫端計算圖片張數，避免行程首屏為了產生簽名網址而讀取大型 Base64 內容。
 */
export async function getExpenseImageCounts(tripId: string, userId: string) {
  const rows = await prisma.$queryRaw<ExpenseImageCountRow[]>`
    SELECT
      expense."id",
      CASE
        WHEN jsonb_typeof(expense."images") = 'array'
          THEN LEAST(jsonb_array_length(expense."images"), 3)
        ELSE 0
      END AS "imageCount"
    FROM "Expense" AS expense
    WHERE expense."tripId" = ${tripId}
      AND EXISTS (
        SELECT 1
        FROM "TripMember" AS membership
        WHERE membership."tripId" = expense."tripId"
          AND membership."userId" = ${userId}
      )
  `

  return new Map(rows.map((row) => [row.id, row.imageCount]))
}
