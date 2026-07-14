import { redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { getTripDashboard } from "@/lib/trip-dashboard"
import HomeClient from "./home-client"

export default async function HomePage() {
  const session = await auth()
  if (!session?.user?.id) {
    redirect("/login")
  }

  const trips = await getTripDashboard(session.user.id)

  return (
    <HomeClient
      initialTrips={trips}
      userName={session.user.name || "Traveler"}
    />
  )
}
