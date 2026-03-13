import { getAllTripIds, getTripById } from "@/services/trips";
import { notFound } from "next/navigation";

// All client-side work is delegated to TripClientPage.
import TripClientPage from "./TripClientPage";

// dynamicParams = false + generateStaticParams([]) together mean:
// "generate one static HTML shell; reject unknown params at the routing level
// and let client-side JavaScript handle the actual ID at runtime."
export const dynamicParams = false;

interface PageProps {
  params: Promise<{ id: string }>;
}

export async function generateStaticParams() {
  const ids = getAllTripIds();
  return ids.map((id) => ({ id }));
}

export default async function TripPage({ params }: PageProps) {
  const { id } = await params;
  const trip = await getTripById(id);
  
  if (!trip) {
    notFound();
  }

  return <TripClientPage trip={trip} />;
}
