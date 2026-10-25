/** Route `/admin/trips/`: the static shell over every saved trip. */

import TripsClientPage from "./TripsClientPage";

/** `/admin/trips/` — a static shell over every saved trip; nothing here reads the query. */
export default function AdminTripsPage() {
  return <TripsClientPage />;
}
