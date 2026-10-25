/** Route `/dashboard/`: the static shell over the trips home. */

import TripsHome from "./TripsHome";

/**
 * `/dashboard/`, the signed-in home (ADR 0020), as a static shell (ADR 0011).
 * Nothing reads the query string, so no `Suspense` boundary is needed.
 */
export default function DashboardPage() {
  return <TripsHome />;
}
