/**
 * Next.js Middleware — 保護需要登入的路由
 * 使用 cookies 檢查 session token 是否存在
 */
import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl
  const isAuthPage = pathname.startsWith('/login')
  const isInvitePage = pathname.startsWith('/invite')

  // 檢查 NextAuth session token（JWT 模式）
  // NextAuth v5 在 HTTPS 下使用 __Secure- 前綴
  const sessionToken =
    req.cookies.get('__Secure-authjs.session-token')?.value ||
    req.cookies.get('authjs.session-token')?.value ||
    req.cookies.get('next-auth.session-token')?.value

  const isLoggedIn = !!sessionToken

  // 已登入 → 不需要看登入頁
  if (isLoggedIn && isAuthPage) {
    return NextResponse.redirect(new URL('/', req.url))
  }

  // 未登入 → 導向登入頁（邀請頁例外，邀請頁自己處理登入引導）
  if (!isLoggedIn && !isAuthPage && !isInvitePage) {
    return NextResponse.redirect(new URL('/login', req.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|images).*)'],
}
