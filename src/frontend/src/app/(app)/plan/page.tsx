import { Suspense } from "react";
import LoadingSpinner from "@/components/common/LoadingSpinner";
import PlannerClientPage from "./PlannerClientPage";

/**
 * The trip planner (`/plan/`, optionally `?q=<prompt>` or `?trip=<id>`): a static shell.
 *
 * The conversation and the itinerary are per user and per session, so
 * nothing about them is known at build time; the client page streams from
 * ai_api with the session token. `useSearchParams` (for `?q=` and `?trip=`)
 * needs a `Suspense` boundary above it on a static export (ADR 0011).
 */
export default function PlanPage() {
  return (
    <Suspense fallback={<LoadingSpinner />}>
      <PlannerClientPage />
    </Suspense>
  );
}
