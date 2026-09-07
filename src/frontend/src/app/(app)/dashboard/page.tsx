import { getTripSummaries } from "@/services/trips";
import DashboardClientPage from "./DashboardClientPage";


/**
 * Dashboard (`/dashboard`) Server Route.
 * 
 * This Server Component is responsible for fetching the user's trip summaries
 * from the API service layer during the server-side rendering phase.
 * It then passes this structured data to the `DashboardClientPage` for rendering.
 */
export default async function DashboardPage() {
  const trips = await getTripSummaries();
  return <DashboardClientPage initialTrips={trips} />;
}
