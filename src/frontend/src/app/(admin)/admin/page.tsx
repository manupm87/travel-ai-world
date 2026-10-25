/** Route `/admin/`: the static shell over the overview. */

import { Suspense } from "react";
import LoadingSpinner from "@/components/common/LoadingSpinner";
import OverviewClientPage from "./OverviewClientPage";

/**
 * `/admin/`, the overview (`?range=30` for the last 30 days), as a static shell.
 * `useSearchParams` needs a `Suspense` boundary on a static export.
 */
export default function AdminOverviewPage() {
  return (
    <Suspense fallback={<LoadingSpinner />}>
      <OverviewClientPage />
    </Suspense>
  );
}
