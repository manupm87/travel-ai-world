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


/**
 * Generates the static paths for trip pages during the build process.
 * Next.js will prerender a static HTML shell for each ID returned here.
 */
export async function generateStaticParams() {
  const ids = getAllTripIds();
  return ids.map((id) => ({ id }));
}


/**
 * Trip Viewer (`/trip/[id]`) Server Route.
 * 
 * This Server Component handles the routing for an individual trip.
 * It resolves the `id` from the URL params, fetches the trip data from the
 * service layer, and either throws a 404 (if the trip doesn't exist) or
 * passes the data to the client-side `TripClientPage` for interactive rendering.
 * 
 * @param params - The URL parameters containing the trip ID.
 */
export default async function TripPage({ params }: PageProps) {
  const { id } = await params;
  const trip = await getTripById(id);
  
  if (!trip) {
    notFound();
  }

  return <TripClientPage trip={trip} />;
}
