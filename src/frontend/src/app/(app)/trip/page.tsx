import { Suspense } from "react";
import LoadingSpinner from "@/components/common/LoadingSpinner";
import TripClientPage from "./TripClientPage";

/**
 * Trip viewer (`/trip/?id=<uuid>`) route: one static shell for every trip.
 *
 * Trips are per user, so nothing about them is known at build time; the
 * client page reads the id from the query string and fetches the trip from
 * core_api with the session token (ADR 0011). `useSearchParams` needs a
 * `Suspense` boundary above it for the static export: the prerendered HTML
 * carries the fallback, the client renders the rest.
 */
export default function TripPage() {
  return (
    <Suspense fallback={<LoadingSpinner />}>
      <TripClientPage />
    </Suspense>
  );
}
