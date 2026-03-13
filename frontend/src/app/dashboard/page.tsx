import { getTripSummaries } from "@/services/trips";
import DashboardClientPage from "./DashboardClientPage";

export default async function DashboardPage() {
  const trips = await getTripSummaries();
  return <DashboardClientPage initialTrips={trips} />;
}
