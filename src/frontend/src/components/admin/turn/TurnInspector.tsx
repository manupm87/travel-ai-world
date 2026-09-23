"use client";

import { BookOpen, ChevronLeft, ChevronRight, Layers } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useLanguage } from "@/context/LanguageContext";
import type { SessionPosition } from "@/hooks/admin/useSessionTurns";
import { useFormatters } from "@/hooks/useFormatters";
import { interpolate } from "@/i18n";
import type { TurnDetail } from "@/services/admin";
import { BriefPanel } from "./BriefPanel";
import { EventTimeline } from "./EventTimeline";
import { InspectorSection } from "./InspectorParts";
import { InspectorSheet } from "./InspectorSheet";
import { marksInto, turnMarks, type Mark } from "./marks";
import { ModelCalls } from "./ModelCalls";
import { RetrievalPanel } from "./RetrievalPanel";
import { kbId, retrievalViews } from "./retrievals";
import { TraceWaterfall } from "./TraceWaterfall";
import { travellerSummary } from "./traveller";
import { TravellerView } from "./TravellerView";
import { TurnChips } from "./TurnChips";
import type { InspectorTab, Navigate } from "./types";

const DESKTOP = "(min-width: 1024px)";
const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

function subscribeDesktop(onChange: () => void) {
  const query = window.matchMedia?.(DESKTOP);
  query?.addEventListener?.("change", onChange);
  return () => query?.removeEventListener?.("change", onChange);
}
const desktopSnapshot = () => window.matchMedia?.(DESKTOP).matches === true;
const desktopServerSnapshot = () => false;

/** Whether the viewport is `lg` or wider: two columns, or the traveller view and a sheet. */
function useIsDesktop(): boolean {
  return useSyncExternalStore(subscribeDesktop, desktopSnapshot, desktopServerSnapshot);
}

/** "Turn 3 of 5", the turn's date and time, and the previous / next buttons (none without a session). */
function PositionNav({
  turn,
  position,
  onOpenTurn,
}: {
  turn: TurnDetail;
  position: SessionPosition | null;
  onOpenTurn: (turnId: string) => void;
}) {
  const { t } = useLanguage();
  const ti = t.admin.turn.inspector;
  const f = useFormatters();
  const when = f.formatDate(turn.summary.ts, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  const button =
    "inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border-soft text-text-secondary hover:bg-bg-surface hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50";

  return (
    <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
      <p className="flex min-w-0 flex-wrap gap-x-3 text-xs text-text-secondary">
        {position && (
          <span data-testid="turn-position">
            {interpolate(ti.position, { n: position.index + 1, total: position.turns.length })}
          </span>
        )}
        <span className="tabular-nums">{when}</span>
      </p>
      {position && (
        <div className="flex gap-1.5">
          <button
            type="button"
            className={button}
            aria-label={ti.previous}
            disabled={!position.prev}
            onClick={() => position.prev && onOpenTurn(position.prev)}
          >
            <ChevronLeft size={16} aria-hidden="true" />
          </button>
          <button
            type="button"
            className={button}
            aria-label={ti.next}
            disabled={!position.next}
            onClick={() => position.next && onOpenTurn(position.next)}
          >
            <ChevronRight size={16} aria-hidden="true" />
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * The turn inspector (TRA-228, ADR 0024): on the left what the traveller
 * saw, with numbered marks; on the right what they did not — the figures,
 * the trace as a waterfall, the brief, every model call, the SSE timeline
 * and one city-kb panel per search. Below `lg` the right side becomes a
 * bottom sheet with four tabs. A mark scrolls to its section and focuses
 * its heading (on a phone it opens the sheet on the right tab first).
 */
export function TurnInspector({
  turn,
  position,
  onOpenTurn,
}: {
  turn: TurnDetail;
  position: SessionPosition | null;
  onOpenTurn: (turnId: string) => void;
}) {
  const { t } = useLanguage();
  const tt = t.admin.turn;
  const desktop = useIsDesktop();
  const traveller = useMemo(() => travellerSummary(turn.context), [turn]);
  const marks = useMemo(() => turnMarks(turn, traveller), [turn, traveller]);
  const views = useMemo(() => retrievalViews(turn.spans), [turn]);

  const [sheetOpen, setSheetOpen] = useState(false);
  const [tab, setTab] = useState<InspectorTab>("trace");
  const pending = useRef<string | null>(null);
  const [navigation, setNavigation] = useState(0);

  const navigate: Navigate = useCallback(
    (target, nextTab) => {
      pending.current = target;
      if (!desktop) {
        setSheetOpen(true);
        setTab(nextTab);
      }
      setNavigation((n) => n + 1);
    },
    [desktop]
  );

  // After the render that shows the target (the sheet's tab may just have
  // opened), scroll to it and move the focus there.
  useEffect(() => {
    const target = pending.current;
    if (!target) return;
    pending.current = null;
    const element = document.getElementById(target);
    if (!element) return;
    const reduced = window.matchMedia?.(REDUCED_MOTION).matches === true;
    element.scrollIntoView({ block: "start", behavior: reduced ? "auto" : "smooth" });
    element.focus({ preventScroll: true });
  }, [navigation]);

  const onMark = useCallback((mark: Mark) => navigate(mark.target, mark.tab), [navigate]);

  const nav = <PositionNav turn={turn} position={position} onOpenTurn={onOpenTurn} />;

  const trace = (
    <TraceWaterfall turn={turn} marks={marksInto(marks, "trace")} onNavigate={navigate} />
  );
  const brief = <BriefPanel brief={turn.context.brief} />;
  const model = <ModelCalls turn={turn} marks={marksInto(marks, "model")} />;
  const events = <EventTimeline turn={turn} marks={marksInto(marks, "events")} />;
  const kb =
    views.length === 0 ? (
      <InspectorSection id="turn-kb-empty" title={tt.kb.title} icon={BookOpen}>
        <p className="text-sm text-text-secondary">{tt.kb.empty}</p>
      </InspectorSection>
    ) : (
      views.map((view) => (
        <RetrievalPanel
          key={view.seq}
          view={view}
          marks={marks.filter((m) => m.target === kbId(view.seq))}
        />
      ))
    );

  const travellerView = <TravellerView traveller={traveller} marks={marks} onMark={onMark} />;

  if (!desktop) {
    return (
      <div className="pb-28">
        {travellerView}
        <InspectorSheet
          turn={turn}
          open={sheetOpen}
          onOpenChange={setSheetOpen}
          tab={tab}
          onTabChange={setTab}
          nav={nav}
        >
          {tab === "trace" && (
            <>
              {trace}
              {brief}
            </>
          )}
          {tab === "kb" && kb}
          {tab === "model" && model}
          {tab === "events" && events}
        </InspectorSheet>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-[minmax(320px,2fr)_5fr] gap-6">
      <div className="sticky top-(--header-h) max-h-[calc(100dvh-var(--header-h))] self-start overflow-y-auto py-2 pr-1">
        {travellerView}
      </div>
      <section aria-labelledby="turn-inspector" className="flex min-w-0 flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <h2 id="turn-inspector" className="flex items-center gap-2 text-base font-semibold text-text-primary">
            <Layers size={16} aria-hidden="true" className="text-text-secondary" />
            {tt.inspector.title}
          </h2>
          <div className="min-w-0 flex-1">{nav}</div>
        </div>
        <TurnChips turn={turn} />
        {trace}
        <div className="grid gap-4 xl:grid-cols-2">
          {brief}
          {model}
        </div>
        {events}
        {kb}
      </section>
    </div>
  );
}
