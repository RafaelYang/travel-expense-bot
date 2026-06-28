import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ expenseId: string }> }
) {
  try {
    const { expenseId } = await params
    const { searchParams } = new URL(req.url)
    const index = parseInt(searchParams.get("index") || "0", 10)

    const expense = await prisma.expense.findUnique({
      where: { id: expenseId },
    })

    if (!expense || !expense.images) {
      return new Response("Image Not Found", { status: 404 })
    }

    const images = Array.isArray(expense.images) ? (expense.images as string[]) : []
    const targetImage = images[index]

    if (!targetImage) {
      return new Response("Image Index Out of Range", { status: 404 })
    }

    // 如果是 Base64 Data URL (data:image/jpeg;base64,...)，解碼回傳二進位流
    if (targetImage.startsWith("data:image")) {
      const parts = targetImage.split(",")
      if (parts.length < 2) {
        return new Response("Invalid Image Data", { status: 400 })
      }
      
      const header = parts[0]
      const base64Data = parts[1]
      
      const mimeMatch = header.match(/data:(image\/[^;]+);base64/)
      const mimeType = mimeMatch ? mimeMatch[1] : "image/jpeg"

      const buffer = Buffer.from(base64Data, "base64")
      return new Response(buffer, {
        headers: {
          "Content-Type": mimeType,
          "Cache-Control": "public, max-age=86400", // 快取 1 天
        },
      })
    }

    // 如果是實體 http/https 直鏈，直接跳轉
    if (targetImage.startsWith("http")) {
      return NextResponse.redirect(targetImage)
    }

    return new Response("Unsupported Image Format", { status: 400 })
  } catch (err: any) {
    return new Response(err.message, { status: 500 })
  }
}
