// Server component — can export generateStaticParams.
// All client-side work is delegated to TripClientPage.
import TripClientPage from "./TripClientPage";

// dynamicParams = false + generateStaticParams([]) together mean:
// "generate one static HTML shell; reject unknown params at the routing level
// and let client-side JavaScript handle the actual ID at runtime."
export const dynamicParams = false;

export async function generateStaticParams() {
  return [{ id: "_" }]; // single shell; real IDs resolved client-side via useParams()
}

export default function TripPage() {
  return <TripClientPage />;
}
