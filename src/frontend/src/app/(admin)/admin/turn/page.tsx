import { Suspense } from "react";
import LoadingSpinner from "@/components/common/LoadingSpinner";
import TurnClientPage from "./TurnClientPage";

/**
 * `/admin/turn/?id=<turn_id>` — one turn. A query, never a `[id]` route: the
 * export cannot know the ids (ADR 0011). The inspector (TRA-228) renders in the client page.
 */
export default function AdminTurnPage() {
  return (
    <Suspense fallback={<LoadingSpinner />}>
      <TurnClientPage />
    </Suspense>
  );
}
