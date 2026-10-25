/** Route `/admin/turn/`: the static shell over the turn inspector. */

import { Suspense } from "react";
import LoadingSpinner from "@/components/common/LoadingSpinner";
import TurnClientPage from "./TurnClientPage";

/**
 * `/admin/turn/?id=<turn_id>` — one turn's inspector.
 * A query, never a `[id]` route: the export cannot know the ids (ADR 0011).
 */
export default function AdminTurnPage() {
  return (
    <Suspense fallback={<LoadingSpinner />}>
      <TurnClientPage />
    </Suspense>
  );
}
