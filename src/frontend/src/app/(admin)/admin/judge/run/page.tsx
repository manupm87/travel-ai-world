/** Route `/admin/judge/run/`: the static shell over one run of the LLM judge. */

import { Suspense } from "react";
import LoadingSpinner from "@/components/common/LoadingSpinner";
import RunClientPage from "./RunClientPage";

/**
 * `/admin/judge/run/?id=<run_id>` — one run with every item it graded.
 * A query, never a `[id]` route: the export cannot know the ids (ADR 0011).
 */
export default function AdminJudgeRunPage() {
  return (
    <Suspense fallback={<LoadingSpinner />}>
      <RunClientPage />
    </Suspense>
  );
}
