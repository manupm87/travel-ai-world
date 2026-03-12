// Server component — can export generateStaticParams.
// All client-side work is delegated to TripClientPage.
import TripClientPage from "./TripClientPage";

// dynamicParams = false + generateStaticParams([]) together mean:
// "generate one static HTML shell; reject unknown params at the routing level
// and let client-side JavaScript handle the actual ID at runtime."
export const dynamicParams = false;

export async function generateStaticParams() {
  return [
    { id: "trip_euro_2026" },
    { id: "trip_japan_2026" },
    { id: "trip_ny_2025" },
    { id: "trip_prague_vienna_budapest_2024" }
  ]; 
}

export default function TripPage() {
  return <TripClientPage />;
}
