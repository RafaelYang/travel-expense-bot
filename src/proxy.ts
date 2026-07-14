/**
 * Next.js Proxy — 頁面路由的樂觀登入導向。
 * 真正的資料授權仍由 Server Components 與 Route Handlers 執行。
 */
import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl
  const isAuthPage = pathname.startsWith("/login")
  const isInvitePage = pathname.startsWith("/invite")

  const sessionToken =
    req.cookies.get("__Secure-authjs.session-token")?.value
    || req.cookies.get("authjs.session-token")?.value
    || req.cookies.get("next-auth.session-token")?.value

  const isLoggedIn = Boolean(sessionToken)

  if (isLoggedIn && isAuthPage) {
    return NextResponse.redirect(new URL("/", req.url))
  }

  if (!isLoggedIn && !isAuthPage && !isInvitePage) {
    return NextResponse.redirect(new URL("/login", req.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|images).*)"],
}
