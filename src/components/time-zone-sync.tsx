"use client"

import { useEffect } from "react"
import { VISITOR_TIME_ZONE_COOKIE } from "@/lib/active-trip"

const ONE_YEAR_IN_SECONDS = 60 * 60 * 24 * 365

export function TimeZoneSync() {
  useEffect(() => {
    try {
      const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone
      if (!timeZone) return

      const encodedTimeZone = encodeURIComponent(timeZone)
      const existingCookie = document.cookie
        .split("; ")
        .find((cookie) => cookie.startsWith(`${VISITOR_TIME_ZONE_COOKIE}=`))
        ?.slice(VISITOR_TIME_ZONE_COOKIE.length + 1)

      if (existingCookie === encodedTimeZone) return

      document.cookie = [
        `${VISITOR_TIME_ZONE_COOKIE}=${encodedTimeZone}`,
        "Path=/",
        `Max-Age=${ONE_YEAR_IN_SECONDS}`,
        "SameSite=Lax",
      ].join("; ")
    } catch {
      // The server can still fall back to Vercel's visitor time-zone header.
    }
  }, [])

  return null
}
