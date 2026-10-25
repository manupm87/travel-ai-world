"use client";

/** The notice on a trip that is ongoing or over, which can no longer be planned. */

import { Lock } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import type { TripPhase } from "@/types/trip";

/** The two phases a trip can no longer be planned in. */
export type LockedPhase = Exclude<TripPhase, "upcoming">;

export interface LockedNoticeProps {
  phase: LockedPhase;
  /** The one way on from a trip that cannot change: start another. */
  onNewTrip: () => void;
}

/**
 * Stands in for the composer on an ongoing or past trip, which core_api refuses to change
 * (409 `TRIP_LOCKED`, ADR 0019). Styled as a notice, not an error.
 */
export function LockedNotice({ phase, onNewTrip }: LockedNoticeProps) {
  const { t } = useLanguage();
  const l = t.plan.locked;

  return (
    <div className="flex shrink-0 flex-col items-start gap-3 rounded-2xl border border-glass-border bg-glass-bg px-4 py-4 backdrop-blur-xl">
      <p className="flex items-start gap-2.5 text-sm leading-relaxed text-text-secondary">
        <Lock size={15} className="mt-0.5 shrink-0" aria-hidden="true" />
        {l[phase]}
      </p>
      <button
        type="button"
        onClick={onNewTrip}
        className="rounded-lg border border-glass-border px-3.5 py-2 text-sm font-medium text-text-primary transition hover:border-accent-border focus-visible:ring-2 focus-visible:ring-accent/50 focus-visible:outline-none"
      >
        {l.action}
      </button>
    </div>
  );
}
