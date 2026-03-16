"use client";

import { useEffect } from "react";


/**
 * Global Error Boundary (`error.tsx`).
 * 
 * This Client Component acts as the ultimate fallback for any unhandled
 * runtime errors that occur anywhere in the React tree (excluding layout).
 * It prevents the application from completely crashing and shows a user-friendly
 * error message with a recovery button.
 * 
 * @param error - The Error object that was caught.
 * @param reset - A function to try re-rendering the segment that threw the error.
 */
export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {

  useEffect(() => {
    // Log the error to an error reporting service
    console.error("Global Error Boundary caught an error:", error);
  }, [error]);

  return (
    <main className="flex min-h-[50vh] flex-col items-center justify-center p-8 text-center text-text-primary">
      <div className="bg-bg-card max-w-md rounded-2xl border border-border-soft p-8 shadow-2xl">
        <div className="mb-6 flex justify-center">
          <span className="text-4xl text-red-500">⚠️</span>
        </div>
        <h2 className="mb-4 text-2xl font-bold tracking-tight">
          Oops! Something went wrong.
        </h2>
        <p className="text-text-secondary mb-8 text-sm">
          {error.message || "An unexpected error occurred while loading this page."}
        </p>
        <button
          onClick={reset}
          className="bg-accent hover:bg-accent/90 w-full rounded-lg px-6 py-3 font-medium transition-colors"
        >
          Try again
        </button>
      </div>
    </main>
  );
}
