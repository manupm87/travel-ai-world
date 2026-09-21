import TripsHome from "./TripsHome";

/**
 * `/dashboard/` is the signed-in home (TRA-199, ADR 0020): the ask that starts
 * the next trip, and the trips already saved.
 *
 * A static shell, like every page in this group: the trips are per account and
 * unknown at build time, so the client component below loads them with the
 * session token (ADR 0011). Nothing here reads the query string, so no
 * `Suspense` boundary is needed.
 */
export default function DashboardPage() {
  return <TripsHome />;
}
