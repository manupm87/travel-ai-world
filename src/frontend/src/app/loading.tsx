import LoadingSpinner from "@/components/common/LoadingSpinner";

/**
 * Global Loading UI (`loading.tsx`).
 *
 * Rendered by Next.js while a route segment resolves. Reuses the shared
 * spinner so the copy stays in one (translated) place, and centres it over
 * the aurora rather than pinning it near the top of the viewport.
 */
export default function Loading() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center">
      <LoadingSpinner />
    </div>
  );
}
