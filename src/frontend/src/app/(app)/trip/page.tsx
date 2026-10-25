/** Route `/trip/`: the static shell that forwards old links to the planner. */

import { Suspense } from "react";
import LoadingSpinner from "@/components/common/LoadingSpinner";
import TripRedirect from "./TripRedirect";

/**
 * `/trip/?id=<uuid>`: a static shell that forwards to `/plan/?trip=<uuid>`.
 * `useSearchParams` needs a `Suspense` boundary above it on a static export.
 */
export default function TripPage() {
  return (
    <Suspense fallback={<LoadingSpinner />}>
      <TripRedirect />
    </Suspense>
  );
}
