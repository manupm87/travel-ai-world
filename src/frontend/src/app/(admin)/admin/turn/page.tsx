import { Suspense } from "react";
import LoadingSpinner from "@/components/common/LoadingSpinner";
import TurnClientPage from "./TurnClientPage";

/**
 * `/admin/turn/?id=<turn_id>` — one turn. A query, never a `[id]` route: the
 * export cannot know the ids (ADR 0011). TRA-228 builds the inspector here.
 */
export default function AdminTurnPage() {
  return (
    <Suspense fallback={<LoadingSpinner />}>
      <TurnClientPage />
    </Suspense>
  );
}
