"use client";

/** The notice while `/plan/?trip=` opens a saved trip, or when it cannot. */

import Link from "next/link";
import { Loader2 } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";

/** What `/plan/?trip=<id>` is doing; `null` when the planner opened no trip. */
export type OpenTripState =
  | { status: "loading" }
  | { status: "not-found" }
  | { status: "error"; onRetry: () => void };

export interface OpenTripNoticeProps {
  state: OpenTripState;
  /** "New trip" beside the link home when the trip is not found; without it the link stands alone. */
  onNewTrip?: () => void;
}

/**
 * The trip pane while a saved trip loads, or when it never arrives; the chat and map keep working.
 * A missing trip and somebody else's read the same on purpose, so no other ids leak.
 */
export function OpenTripNotice({ state, onNewTrip }: OpenTripNoticeProps) {
  const { t } = useLanguage();
  const l = t.plan.trips;

  if (state.status === "loading") {
    return (
      <div role="status" className="flex items-center gap-3 px-1 py-6 text-text-secondary">
        <Loader2 size={18} className="animate-spin" aria-hidden="true" />
        <span className="text-sm">{l.opening}</span>
      </div>
    );
  }

  const notFound = state.status === "not-found";

  return (
    <div
      role="alert"
      className="flex animate-fade-up flex-col items-start gap-2 rounded-2xl border border-glass-border bg-glass-bg px-5 py-6 backdrop-blur-xl"
    >
      <h2 className="text-lg font-medium text-text-primary">
        {notFound ? l.notFoundTitle : l.loadErrorTitle}
      </h2>
      <p className="text-sm leading-relaxed text-text-secondary">
        {notFound ? l.notFoundDescription : l.loadErrorDescription}
      </p>
      {state.status === "not-found" ? (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Link
            href="/dashboard/"
            className="rounded-lg border border-glass-border bg-glass-bg px-3.5 py-2 text-sm font-medium text-text-primary transition hover:border-accent-border focus-visible:ring-2 focus-visible:ring-accent/50 focus-visible:outline-none"
          >
            {l.title}
          </Link>
          {onNewTrip && (
            <button
              type="button"
              onClick={onNewTrip}
              className="rounded-lg border border-glass-border bg-glass-bg px-3.5 py-2 text-sm font-medium text-text-primary transition hover:border-accent-border focus-visible:ring-2 focus-visible:ring-accent/50 focus-visible:outline-none"
            >
              {l.newTrip}
            </button>
          )}
        </div>
      ) : (
        <button
          type="button"
          onClick={state.onRetry}
          className="mt-2 rounded-lg border border-glass-border bg-glass-bg px-3.5 py-2 text-sm font-medium text-text-primary transition hover:border-accent-border focus-visible:ring-2 focus-visible:ring-accent/50 focus-visible:outline-none"
        >
          {l.retry}
        </button>
      )}
    </div>
  );
}
