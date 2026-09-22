"use client";

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
  /**
   * "New trip" beside the way home when the trip is not there (TRA-223): an
   * empty planner, on this very page. Without it the link stands alone.
   */
  onNewTrip?: () => void;
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
 *
 * The way on from a trip that is not there is the home, where the account's
 * trips are listed (`/dashboard/`, TRA-201) — a link, because it is a
 * navigation; the error state keeps its button, because retrying is not.
 * Starting a new trip instead is an action on this page, so it is a button
 * too (`onNewTrip`, TRA-223).
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
