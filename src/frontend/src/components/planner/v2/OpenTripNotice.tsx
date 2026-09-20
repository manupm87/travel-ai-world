"use client";

import { Loader2 } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";

/** What `/plan/?trip=<id>` is doing; `null` when the planner opened no trip. */
export type OpenTripState =
  | { status: "loading" }
  | { status: "not-found" }
  | { status: "error"; onRetry: () => void };

export interface OpenTripNoticeProps {
  state: OpenTripState;
  /** The way on: the account's trips, over the planner. */
  onShowTrips: () => void;
}

/**
 * The trip pane while a saved trip is on its way, or when it never arrives.
 *
 * It stands in the pane rather than over the page, because that is the one
 * column the trip was going to fill: the chat and the map keep working, and
 * a link to somebody else's trip does not turn the planner into an error
 * page. A missing trip and a forbidden one read the same on purpose — the
 * service resolves both to nothing, so nothing about other people's ids
 * leaks out of here either.
 */
export function OpenTripNotice({ state, onShowTrips }: OpenTripNoticeProps) {
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
      <button
        type="button"
        onClick={notFound ? onShowTrips : state.onRetry}
        className="mt-2 rounded-lg border border-glass-border bg-glass-bg px-3.5 py-2 text-sm font-medium text-text-primary transition hover:border-accent-border focus-visible:ring-2 focus-visible:ring-accent/50 focus-visible:outline-none"
      >
        {notFound ? l.title : l.retry}
      </button>
    </div>
  );
}
