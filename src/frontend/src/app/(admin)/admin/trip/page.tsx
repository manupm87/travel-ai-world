import { Suspense } from "react";
import LoadingSpinner from "@/components/common/LoadingSpinner";
import TripClientPage from "./TripClientPage";

/**
 * `/admin/trip/?user=<user_id>&id=<trip_id>` — anyone's saved trip, read only
 * (TRA-229). A query, never a `[id]` route: the export cannot know the ids
 * (ADR 0011).
 */
export default function AdminTripPage() {
  return (
    <Suspense fallback={<LoadingSpinner />}>
      <TripClientPage />
    </Suspense>
  );
}
