/** Route `/plan/`: the static shell over the planner. */

import { Suspense } from "react";
import LoadingSpinner from "@/components/common/LoadingSpinner";
import PlannerClientPage from "./PlannerClientPage";

/**
 * The trip planner (`/plan/`, optionally `?q=` or `?trip=`) as a static shell.
 * `useSearchParams` needs a `Suspense` boundary above it on a static export (ADR 0011).
 */
export default function PlanPage() {
  return (
    <Suspense fallback={<LoadingSpinner />}>
      <PlannerClientPage />
    </Suspense>
  );
}
