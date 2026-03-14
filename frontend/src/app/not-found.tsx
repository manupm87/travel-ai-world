"use client";

import Link from "next/link";


/**
 * Global 404 Fallback (`not-found.tsx`).
 * 
 * Rendered when a user navigates to a URL that doesn't exist, or when a Server Component
 * explicitly calls the `notFound()` Next.js function (e.g., when a trip ID isn't found in DB).
 */
export default function NotFound() {
  return (
    <main className="flex min-h-[50vh] flex-col items-center justify-center p-8 text-center text-white">
      <div className="bg-bg-card max-w-md rounded-2xl border border-white/5 p-8 shadow-2xl">
        <div className="mb-6 flex justify-center">
          <span className="text-4xl text-text-secondary">🗺️</span>
        </div>
        <h2 className="mb-4 text-3xl font-bold tracking-tight">
          404 - Not Found
        </h2>
        <p className="text-text-secondary mb-8 text-sm">
          We couldn&apos;t find the page or trip you were looking for. 
        </p>
        <Link
          href="/dashboard"
          className="bg-accent hover:bg-accent/90 w-full inline-block rounded-lg px-6 py-3 font-medium transition-colors"
        >
          Return Home
        </Link>
      </div>
    </main>
  );
}
