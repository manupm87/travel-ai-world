import { Suspense } from "react";
import LoadingSpinner from "@/components/common/LoadingSpinner";
import TripRedirect from "./TripRedirect";

/**
 * `/trip/?id=<uuid>` was the trip viewer; since TRA-196 a saved trip opens in
 * the planner instead (`/plan/?trip=<uuid>`), so this route is one static
 * shell that forwards. `useSearchParams` needs a `Suspense` boundary above it
 * on a static export: the prerendered HTML carries the fallback, the client
 * reads the id and replaces the URL.
 */
export default function TripPage() {
  return (
    <Suspense fallback={<LoadingSpinner />}>
      <TripRedirect />
    </Suspense>
  );
}
