"use client";

import { useEffect, useId, useState, type ReactNode } from "react";
import { Briefcase, Check, ChevronDown, AlertTriangle } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { interpolate } from "@/i18n";
import { Kiri, type KiriState } from "@/components/kiri/Kiri";
import {
  PACKING_STEPS,
  type ItineraryDraft,
  type PackingState,
  type PackingStep,
} from "@/hooks/plannerReducer";
import type { TripBrief } from "@/types/planner";
import { cn } from "@/utils/cn";
import { Suitcase } from "./Suitcase";

/** How long the lid takes to turn over and shut (`.suitcase-lid`). */
const CLOSING_MS = 1300;

function prefersReducedMotion(): boolean {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
}

/** Kiri's face for each step on its way. */
const KIRI_FOR: Record<PackingStep, KiriState> = {
  open: "look",
  list: "thinking",
  wardrobe: "searching",
  fold: "thinking",
  weigh: "searching",
  zip: "happy",
};

/** `0:07`: the time the turn has been on its way. */
function clock(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

/** Kiri's name tag, in the one typeface that is only hers. */
export function KiriTag({ state = "idle" }: { state?: KiriState }) {
  const { t } = useLanguage();
  return (
    <span className="flex items-center gap-2">
      <Kiri state={state} scale={2} />
      <span className="font-pixel text-sm text-text-secondary">{t.plan.packing.kiri}</span>
    </span>
  );
}

/** The six steps as a list: done, the one on its way, and the ones to come. */
function StepList({ packing }: { packing: PackingState }) {
  const { t } = useLanguage();
  const p = t.plan.packing;
  const at = PACKING_STEPS.indexOf(packing.step);
  const finished = packing.step === "zip";

  return (
    <ol className="flex flex-col gap-2.5">
      {PACKING_STEPS.map((step, index) => {
        const done = index < at || finished;
        const current = index === at && !finished;
        const heavy = step === "weigh" && packing.warned;
        return (
          <li
            key={step}
            data-step={step}
            data-state={done ? "done" : current ? "current" : "pending"}
            className={cn("flex items-start gap-3", !done && !current && "opacity-45")}
          >
            <span
              aria-hidden="true"
              className={cn(
                "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border",
                current && "animate-pulse border-transparent bg-action text-on-action",
                done && !heavy && "border-transparent bg-bg-surface text-text-secondary",
                done && heavy && "border-transparent bg-warning/15 text-warning",
                !done && !current && "border-glass-border text-text-muted"
              )}
            >
              {heavy ? (
                <AlertTriangle size={13} />
              ) : done ? (
                <Check size={13} />
              ) : (
                <span className="text-xs font-semibold">{index + 1}</span>
              )}
            </span>
            <span className="flex min-w-0 flex-col pt-1">
              <span className={cn("text-sm font-semibold", heavy && "text-warning")}>
                {p.steps[step]}
              </span>
              <span className="text-sm leading-snug text-text-secondary">{p.details[step]}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

export interface PackingStatusProps {
  packing: PackingState;
  /** The turn is still on its way. */
  streaming: boolean;
  /** What the suitcase is filled with: the brief, the days, the options. */
  brief: TripBrief;
  itinerary: ItineraryDraft;
  optionTitles?: string[];
  /** What the closed suitcase turned into: the boarding pass, when there is a trip. */
  children?: ReactNode;
}

/**
 * Kiri's answer as packing a suitcase (TRA-239, TRA-242). While the turn
 * streams: the step it has reached and its sentence (ai_api's, from the
 * `progress` event), the clock, and the open `Suitcase` filling up — the list,
 * the sources, the days — with the weight meter under it and the six steps a
 * press away. When it ends the lid shuts, and then: "Suitcase closed in 9 s"
 * (", with a warning"), what it became — the boarding pass — and "See how I
 * packed". The clock is the browser's own, started when this turn's status
 * mounted.
 */
export function PackingStatus({
  packing,
  streaming,
  brief,
  itinerary,
  optionTitles = [],
  children,
}: PackingStatusProps) {
  const { t } = useLanguage();
  const p = t.plan.packing;
  const listId = useId();
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [now, setNow] = useState<number | null>(null);
  const [open, setOpen] = useState(false);
  const [stepsOpen, setStepsOpen] = useState(false);
  // The lid shutting, between the end of the stream and the boarding pass.
  const [shut, setShut] = useState(false);

  // The clock starts with the turn and stops with it.
  useEffect(() => {
    const start = Date.now();
    const first = window.setTimeout(() => {
      setStartedAt(start);
      setNow(start);
    }, 0);
    return () => window.clearTimeout(first);
  }, []);
  useEffect(() => {
    if (!streaming) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [streaming]);
  useEffect(() => {
    if (streaming) return;
    const stop = window.setTimeout(() => setNow(Date.now()), 0);
    const close = window.setTimeout(() => setShut(true), prefersReducedMotion() ? 0 : CLOSING_MS);
    return () => {
      window.clearTimeout(stop);
      window.clearTimeout(close);
    };
  }, [streaming]);

  const elapsed = startedAt !== null && now !== null ? now - startedAt : 0;
  const at = PACKING_STEPS.indexOf(packing.step);

  if (streaming || !shut) {
    const heavy = packing.warned;
    const weighed = at >= PACKING_STEPS.indexOf("weigh");
    return (
      <div
        className="flex animate-fade-up flex-col gap-2"
        data-packing={streaming ? packing.step : "closing"}
      >
        <KiriTag state={streaming ? KIRI_FOR[packing.step] : "happy"} />
        <div className="flex flex-col gap-3 rounded-2xl border border-glass-border bg-glass-bg px-3.5 py-3 backdrop-blur-xl">
          <div role="status" className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <span aria-hidden="true" className="h-2 w-2 animate-pulse rounded-full bg-accent" />
              <span className="flex-1 text-[14px] font-semibold text-text-primary">
                {streaming ? `${p.steps[packing.step]}…` : p.closed}
              </span>
              <span className="text-[13px] tabular-nums text-text-muted" aria-hidden="true">
                {clock(elapsed)}
              </span>
              <span className="sr-only">
                {interpolate(p.elapsed, { seconds: Math.floor(elapsed / 1000) })}
              </span>
            </div>
            <p className="text-sm leading-snug text-text-secondary">
              {packing.detail || p.details[packing.step]}
            </p>
          </div>

          <Suitcase
            packing={packing}
            brief={brief}
            itinerary={itinerary}
            optionTitles={optionTitles}
            closed={!streaming}
          />

          <div className="flex items-center gap-2.5 text-[13px]" aria-hidden="true">
            <span className="text-text-secondary">{p.suitcase.weight}</span>
            <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-accent-soft">
              <span
                className={cn(
                  "block h-full rounded-full transition-[width] duration-1000 ease-out",
                  heavy ? "bg-sticker-overweight" : "bg-accent"
                )}
                style={{ width: weighed ? (heavy ? "92%" : "62%") : "0%" }}
              />
            </span>
            <span className="min-w-[7.5rem] text-right text-text-muted">
              {!weighed
                ? p.suitcase.unweighed
                : heavy
                  ? p.suitcase.overweight
                  : p.suitcase.withinLimits}
            </span>
          </div>

          <button
            type="button"
            onClick={() => setStepsOpen((was) => !was)}
            aria-expanded={stepsOpen}
            aria-controls={listId}
            className="inline-flex items-center gap-1 self-start rounded-md text-[13px] text-text-secondary transition-colors hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
          >
            {stepsOpen ? p.suitcase.hideSteps : p.suitcase.showSteps}
            <ChevronDown
              size={14}
              aria-hidden="true"
              className={cn("transition-transform", stepsOpen && "rotate-180")}
            />
          </button>
          <div id={listId} hidden={!stepsOpen} className="border-t border-glass-border pt-3">
            {stepsOpen && <StepList packing={packing} />}
          </div>
        </div>
      </div>
    );
  }

  const seconds = Math.max(1, Math.round(elapsed / 1000));

  return (
    <div className="flex animate-fade-up flex-col gap-2" data-packing="zip">
      <KiriTag state="happy" />
      <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[14px]">
        <Briefcase size={15} aria-hidden="true" className="text-accent" />
        <span className="font-semibold text-text-primary">{p.closed}</span>
        {startedAt !== null && (
          <span className="text-[13px] text-text-muted">
            {interpolate(p.closedIn, { seconds })}
            {packing.warned && `, ${p.withWarning}`}
          </span>
        )}
      </p>
      {children}
      <button
        type="button"
        onClick={() => setOpen((was) => !was)}
        aria-expanded={open}
        aria-controls={listId}
        className="inline-flex items-center gap-1 self-start rounded-md text-[13px] text-text-secondary transition-colors hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
      >
        {p.howIPacked}
        <ChevronDown
          size={14}
          aria-hidden="true"
          className={cn("transition-transform", open && "rotate-180")}
        />
      </button>
      <div id={listId} hidden={!open} className="pt-1">
        {open && <StepList packing={packing} />}
      </div>
    </div>
  );
}
