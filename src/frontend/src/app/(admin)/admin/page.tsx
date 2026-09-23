import { Suspense } from "react";
import LoadingSpinner from "@/components/common/LoadingSpinner";
import OverviewClientPage from "./OverviewClientPage";

/**
 * `/admin/` — the overview (`?range=30` for the last 30 days). A static
 * shell: the stats are read in the browser with the admin's token, and
 * `useSearchParams` needs a `Suspense` boundary on a static export.
 */
export default function AdminOverviewPage() {
  return (
    <Suspense fallback={<LoadingSpinner />}>
      <OverviewClientPage />
    </Suspense>
  );
}
