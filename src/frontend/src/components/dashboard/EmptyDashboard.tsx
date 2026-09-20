"use client";

import { useLanguage } from "@/context/LanguageContext";

/**
 * An account with no trips yet.
 *
 * There is nothing to offer here that the page does not already have: the
 * field that starts a trip is at the top of the dashboard. So this is two
 * lines — what is missing, and what to do about it — and not a second call to
 * action competing with the first.
 */
export default function EmptyDashboard() {
  const { t } = useLanguage();

  return (
    <div className="rounded-2xl border border-dashed border-glass-border px-6 py-14 text-center">
      <h3 className="text-xl font-medium text-text-primary">{t.dashboard.emptyTitle}</h3>
      <p className="mt-2 text-[15px] text-text-secondary">{t.dashboard.emptyDescription}</p>
    </div>
  );
}
