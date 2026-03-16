/**
 * A reusable loading spinner component.
 */
export default function LoadingSpinner() {
  return (
    <div className="flex flex-col items-center justify-center p-8">
      <div className="flex items-center gap-3">
        <div className="border-accent h-6 w-6 animate-spin rounded-full border-t-2 border-r-2" />
        <span className="text-text-secondary font-medium tracking-wide text-sm">Loading...</span>
      </div>
    </div>
  );
}
