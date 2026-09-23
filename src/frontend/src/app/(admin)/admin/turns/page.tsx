import { Suspense } from "react";
import LoadingSpinner from "@/components/common/LoadingSpinner";
import TurnsClientPage from "./TurnsClientPage";

/** `/admin/turns/?day=&kind=&status=&subject=&city=` — a static shell over the turns explorer. */
export default function AdminTurnsPage() {
  return (
    <Suspense fallback={<LoadingSpinner />}>
      <TurnsClientPage />
    </Suspense>
  );
}
