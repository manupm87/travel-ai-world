"use client";

import { useLanguage } from "@/context/LanguageContext";

/** Enough to fill the first row on a desktop without promising a count. */
const PLACEHOLDERS = [0, 1, 2];

/**
 * What stands in the grid while the trips are on their way: cards of the right
 * size, sweeping once, so the page does not jump when the real ones land. The
 * sweep says nothing to a screen reader — the live line under it does.
 */
export function TripGridSkeleton() {
  const { t } = useLanguage();

  return (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
      <p role="status" className="sr-only">
        {t.dashboard.loading}
      </p>
      {PLACEHOLDERS.map((index) => (
        <div
          key={index}
          aria-hidden="true"
          className="h-[248px] animate-shimmer rounded-2xl border border-glass-border bg-gradient-to-r from-bg-card via-bg-secondary to-bg-card bg-[length:200%_100%]"
        />
      ))}
    </div>
  );
}
