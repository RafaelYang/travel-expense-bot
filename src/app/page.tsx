import { redirect } from "next/navigation"
import { cookies, headers } from "next/headers"
import { auth } from "@/lib/auth"
import { getCurrentWritableTripId, getTripDashboard } from "@/lib/trip-dashboard"
import {
  getCalendarDayKey,
  isAllTripsView,
  resolveCalendarTimeZone,
  VISITOR_TIME_ZONE_COOKIE,
} from "@/lib/active-trip"
import HomeClient from "./home-client"

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string | string[] }>
}) {
  const session = await auth()
  if (!session?.user?.id) {
    redirect("/login")
  }

  const [query, requestHeaders, cookieStore] = await Promise.all([
    searchParams,
    headers(),
    cookies(),
  ])
  const timeZone = resolveCalendarTimeZone(
    cookieStore.get(VISITOR_TIME_ZONE_COOKIE)?.value,
    requestHeaders.get("x-vercel-ip-timezone"),
  )
  const todayDayKey = getCalendarDayKey(
    new Date(),
    timeZone,
  )
  const currentTripId = await getCurrentWritableTripId(session.user.id, todayDayKey)

  if (!isAllTripsView(query.view) && currentTripId) {
    redirect(`/trips/${encodeURIComponent(currentTripId)}`)
  }

  const trips = await getTripDashboard(session.user.id)

  return (
    <HomeClient
      initialTrips={trips}
      userName={session.user.name || "Traveler"}
      currentTripId={currentTripId}
    />
  )
}
