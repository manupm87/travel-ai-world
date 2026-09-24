"use client";

import { useId } from "react";
import { Button } from "@/components/ui/Button";
import { useLanguage } from "@/context/LanguageContext";
import type { UseSaveTripResult } from "@/hooks/useSaveTrip";
import { cn } from "@/utils/cn";
import type { LockedPhase } from "./LockedNotice";
import { SaveTripButton } from "./SaveTripButton";
import { ShareButton } from "./ShareButton";

export interface TripHeaderProps {
  /** `bar`: one line in the app header (desktop); `panel`: stacked over the trip. */
  variant: "bar" | "panel";
  heading: string;
  /** "3 days · 12 experiences · 1 hotel" (panel) or "Oct 23 – Oct 25, 2 adults" (bar). */
  summary: string;
  lockedPhase: LockedPhase | null;
  save: UseSaveTripResult;
  onNewTrip?: () => void;
  onReset: () => void;
  className?: string;
}

/**
 * The trip's name and what can be done with it: Share, Save, New trip and
 * Start over (TRA-244). On a desktop it is the app header's middle, as the
 * canvas's planner puts "Budapest, 12–15 Oct, 2 adults · Share · Save trip"
 * beside the logo; below `lg` it is the top of the trip pane, the title on its
 * own line and the actions wrapping under it, so a narrow pane never squeezes
 * the title into one word per line.
 *
 * "New trip" leaves the saved trip and "Start over" stays on it: the first
 * sits with Save (both are about the trip), the second stands apart behind a
 * rule, and each carries a short description, so the two are never mistaken
 * for synonyms. A trip that can no longer change offers none of them.
 */
export function TripHeader({
  variant,
  heading,
  summary,
  lockedPhase,
  save,
  onNewTrip,
  onReset,
  className,
}: TripHeaderProps) {
  const { t } = useLanguage();
  const p = t.plan.panel;
  const hintId = useId();
  const bar = variant === "bar";

  const actions = (
    <div className={cn("flex items-center gap-2", bar ? "shrink-0" : "flex-wrap")}>
      {save.tripId !== null && <ShareButton tripId={save.tripId} />}
      {!lockedPhase && (
        <>
          <SaveTripButton
            status={save.status}
            tripId={save.tripId}
            canSave={save.canSave}
            blocked={save.blocked}
            onSave={save.save}
          />
          {save.tripId !== null && onNewTrip && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onNewTrip}
              title={p.newTripHint}
              aria-describedby={`${hintId}-new`}
              className="px-3 py-2 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
            >
              {t.plan.trips.newTrip}
            </Button>
          )}
          <span className="flex items-center border-l border-border pl-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={onReset}
              title={p.resetHint}
              aria-describedby={`${hintId}-reset`}
              className="px-3 py-2 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
            >
              {p.reset}
            </Button>
          </span>
          <span id={`${hintId}-new`} className="sr-only">
            {p.newTripHint}
          </span>
          <span id={`${hintId}-reset`} className="sr-only">
            {p.resetHint}
          </span>
        </>
      )}
    </div>
  );

  if (bar) {
    return (
      <div className={cn("min-w-0 flex-1 items-center gap-4 pl-6", className)}>
        <div className="flex min-w-0 items-baseline gap-2.5">
          <h2 className="truncate font-heading text-base font-medium text-text-primary">{heading}</h2>
          <span className="truncate text-[13px] text-text-secondary">{summary}</span>
        </div>
        <div className="ml-auto">{actions}</div>
      </div>
    );
  }

  return (
    <header className={cn("flex animate-fade-up flex-col gap-3", className)}>
      <div className="flex min-w-0 flex-col gap-1">
        <span className="text-xs text-text-secondary">
          {lockedPhase ? t.plan.trips.phase[lockedPhase] : p.draft}
        </span>
        <h2 className="text-xl font-medium leading-tight text-text-primary">{heading}</h2>
        <p className="text-xs text-text-secondary">{summary}</p>
      </div>
      {actions}
    </header>
  );
}
