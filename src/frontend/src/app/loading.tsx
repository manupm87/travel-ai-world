import LoadingSpinner from "@/components/common/LoadingSpinner";

/**
 * Global Loading UI (`loading.tsx`).
 *
 * Rendered by Next.js while a route segment resolves. Reuses the shared
 * spinner so the copy stays in one (translated) place.
 */
export default function Loading() {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center">
      <LoadingSpinner />
    </div>
  );
}
