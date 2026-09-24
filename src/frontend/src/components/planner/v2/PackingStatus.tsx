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
import { DAY_PARTS, type TripBrief } from "@/types/planner";
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
 * The replay's timeline (TRA-244), in ms from its start: the lid opens, the
 * list is written, the wardrobe gives up its sources, the days fill one stop
 * after another, the suitcase is weighed and shut. Only the fold's length
 * depends on the trip: every stop takes `TILE_MS`.
 */
const REPLAY = { list: 700, wardrobe: 1400, fold: 2100 } as const;
const TILE_MS = 110;
const WEIGH_AFTER_TILES_MS = 500;
const CLOSE_AFTER_WEIGH_MS = 1100;

/** The stops the base shows (`Suitcase`: four compartments, two tiles each). */
function tilesOf(itinerary: ItineraryDraft): number {
  return itinerary.days
    .slice(0, 4)
    .reduce((total, day) => total + Math.min(2, DAY_PARTS.reduce((n, part) => n + day.slots[part].length, 0)), 0);
}

type Replay = PackingStep | "closing" | "done";

/**
 * Kiri's answer as packing a suitcase (TRA-239, TRA-242, TRA-244).
 *
 * While the turn streams it is one compact card, as the canvas's planner
 * draws it: the step and its sentence (ai_api's `progress`), the clock, a bar
 * of six and the steps a press away. When the turn has packed the trip — it
 * started with no days and ended with some — the whole suitcase is played once,
 * in order, at its own pace: it opens, the list is written, the sources come
 * out of the wardrobe, each day's stops drop in one by one, it is weighed and
 * it shuts, and then it is the boarding pass. Any other turn closes quietly:
 * "Suitcase closed in 3 s". Under reduced motion the replay is skipped.
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
  const [replay, setReplay] = useState<Replay | null>(null);

  const drafted = packing.daysBefore === 0 && itinerary.days.length > 0 && packing.folded;

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

  // The end of the stream: stop the clock and, for the turn that packed the
  // trip, play the suitcase once.
  useEffect(() => {
    if (streaming) return;
    const timers = [window.setTimeout(() => setNow(Date.now()), 0)];
    if (drafted && !prefersReducedMotion()) {
      const weighAt = REPLAY.fold + tilesOf(itinerary) * TILE_MS + WEIGH_AFTER_TILES_MS;
      const steps: Array<[number, Replay]> = [
        [0, "open"],
        [REPLAY.list, "list"],
        [REPLAY.wardrobe, "wardrobe"],
        [REPLAY.fold, "fold"],
        [weighAt, "weigh"],
        [weighAt + CLOSE_AFTER_WEIGH_MS, "closing"],
        [weighAt + CLOSE_AFTER_WEIGH_MS + CLOSING_MS, "done"],
      ];
      for (const [at, stage] of steps) timers.push(window.setTimeout(() => setReplay(stage), at));
    }
    return () => timers.forEach((id) => window.clearTimeout(id));
    // The replay is decided once, when the stream ends.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [streaming]);

  const elapsed = startedAt !== null && now !== null ? now - startedAt : 0;
  const at = PACKING_STEPS.indexOf(packing.step);

  const stepsToggle = (
    <>
      <button
        type="button"
        onClick={() => setOpen((was) => !was)}
        aria-expanded={open}
        aria-controls={listId}
        className="inline-flex items-center gap-1 self-start rounded-md text-[13px] text-text-secondary transition-colors hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
      >
        {streaming ? (open ? p.suitcase.hideSteps : p.suitcase.showSteps) : p.howIPacked}
        <ChevronDown
          size={14}
          aria-hidden="true"
          className={cn("transition-transform", open && "rotate-180")}
        />
      </button>
      <div id={listId} hidden={!open} className="pt-1">
        {open && <StepList packing={packing} />}
      </div>
    </>
  );

  if (streaming) {
    return (
      <div className="flex animate-fade-up flex-col gap-2" data-packing={packing.step}>
        <KiriTag state={KIRI_FOR[packing.step]} />
        <div className="flex flex-col gap-2.5 rounded-2xl border border-glass-border bg-glass-bg px-3.5 py-3 backdrop-blur-xl">
          <div role="status" className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <span aria-hidden="true" className="h-2 w-2 animate-pulse rounded-full bg-accent" />
              <span className="flex-1 text-sm font-semibold text-text-primary">
                {`${p.steps[packing.step]}…`}
              </span>
              <span className="text-xs tabular-nums text-text-muted" aria-hidden="true">
                {clock(elapsed)}
              </span>
              <span className="sr-only">
                {interpolate(p.elapsed, { seconds: Math.floor(elapsed / 1000) })}
              </span>
            </div>
            <p className="text-[13px] leading-snug text-text-secondary">
              {packing.detail || p.details[packing.step]}
            </p>
          </div>
          <div aria-hidden="true" className="grid grid-cols-6 gap-1">
            {PACKING_STEPS.map((step, index) => (
              <span
                key={step}
                className={cn(
                  "h-1.5 rounded-full transition-colors duration-500",
                  index < at ? "bg-accent" : index === at ? "animate-pulse bg-accent/60" : "bg-bg-surface"
                )}
              />
            ))}
          </div>
          {stepsToggle}
        </div>
      </div>
    );
  }

  // From the render the stream ends in, so the boarding pass never flashes
  // before the suitcase that turns into it.
  const replaying = drafted && replay !== "done" && !prefersReducedMotion();
  if (replaying) {
    const current: Replay = replay ?? "open";
    const stage: PackingStep = current === "closing" ? "zip" : (current as PackingStep);
    const weighed = PACKING_STEPS.indexOf(stage) >= PACKING_STEPS.indexOf("weigh");
    const heavy = packing.warned;
    return (
      <div className="flex flex-col gap-2" data-packing="replay" data-replay={current}>
        <KiriTag state={current === "closing" ? "happy" : KIRI_FOR[stage]} />
        <div className="flex flex-col gap-3 rounded-2xl border border-glass-border bg-glass-bg px-3.5 py-3 backdrop-blur-xl">
          <p className="flex items-center gap-2 text-sm font-semibold text-text-primary">
            <span aria-hidden="true" className="h-2 w-2 rounded-full bg-accent" />
            {current === "closing" ? p.closed : `${p.steps[stage]}…`}
          </p>
          <Suitcase
            stage={stage}
            packing={packing}
            brief={brief}
            itinerary={itinerary}
            optionTitles={optionTitles}
            closed={current === "closing"}
            tileMs={TILE_MS}
          />
          <div className="flex items-center gap-2.5 text-[13px]" aria-hidden="true">
            <span className="text-text-secondary">{p.suitcase.weight}</span>
            <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-accent-soft">
              <span
                className={cn(
                  "block h-full rounded-full transition-[width] duration-700 ease-out",
                  heavy ? "bg-sticker-overweight" : "bg-accent"
                )}
                style={{ width: weighed ? (heavy ? "92%" : "62%") : "0%" }}
              />
            </span>
            <span className="min-w-[7.5rem] text-right text-text-muted">
              {!weighed ? p.suitcase.unweighed : heavy ? p.suitcase.overweight : p.suitcase.withinLimits}
            </span>
          </div>
        </div>
      </div>
    );
  }

  const seconds = Math.max(1, Math.round(elapsed / 1000));

  return (
    <div className="flex animate-fade-up flex-col gap-2" data-packing="zip">
      <KiriTag state="happy" />
      <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm">
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
      {stepsToggle}
    </div>
  );
}
