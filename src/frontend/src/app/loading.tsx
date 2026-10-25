/** The app-wide loading state. */

import LoadingSpinner from "@/components/common/LoadingSpinner";

/** Shown by Next while a route segment resolves: the shared spinner, centred. */
export default function Loading() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center">
      <LoadingSpinner />
    </div>
  );
}
