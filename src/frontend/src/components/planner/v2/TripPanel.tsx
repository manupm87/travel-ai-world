"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { useLanguage } from "@/context/LanguageContext";
import { interpolate } from "@/i18n";
import {
  hasItinerary,
  partOf,
  type OptionGroupState,
  type PlannerState,
} from "@/hooks/plannerReducer";
import { DAY_PARTS, type Slot } from "@/types/planner";
import { routeLegs } from "./RouteStrip";
import { AlternativesSheet } from "./AlternativesSheet";
import { BriefChecklist } from "./BriefChecklist";
import { DayCard } from "./DayCard";
import { DayStrip } from "./DayStrip";
import type { MapStop } from "./mapStops";
import { RouteStrip } from "./RouteStrip";
import { StayCard } from "./StayCard";
import { dateForDay, daysBetween } from "./tripDates";
import { WarningBadge } from "./WarningBadge";

export interface TripPanelProps {
  state: PlannerState;
  /** The day the strip, the day card and the map slot are showing. */
  selectedDay: number;
  onSelectDay: (day: number) => void;
  /** The pins of that day (`toMapStops`), so the cards carry their numbers. */
  mapStops: MapStop[];
  /** The pin selected on the map, `null` for none. */
  selectedStopId: string | null;
  onSelectStop: (id: string | null) => void;
  onGenerate: () => void;
  onRemove: (slot: Slot, cardId: string) => void;
  onSelect: (groupId: string, cardIds: string[]) => void;
  onDismiss: (groupId: string, cardId: string) => void;
  onToggleShortlist: (cardId: string) => void;
  onAskAlternatives: (slot: Slot) => void;
  onReset: () => void;
}

/** The stay has no day of its own; this pseudo-slot opens its sheet. */
const STAY_SLOT: Slot = { day: 0, part: null };

/**
 * The planner's middle column: the brief checklist until an itinerary exists,
 * then the draft trip (route, stay, the day strip and the one day it has
 * selected) and the alternatives sheet the "Change" buttons open. The map is
 * the column beside it (`TripMap`); what they share is `mapStops`, which gives
 * every card here the number of its pin there. The panel owns nothing but the
 * sheet: every mutation, the selected day and the selected pin included, is a
 * callback the page turns into a planner action.
 */
export function TripPanel({
  state,
  selectedDay,
  onSelectDay,
  mapStops,
  selectedStopId,
  onSelectStop,
  onGenerate,
  onRemove,
  onSelect,
  onDismiss,
  onToggleShortlist,
  onAskAlternatives,
  onReset,
}: TripPanelProps) {
  const { t } = useLanguage();
  const [changing, setChanging] = useState<Slot | null>(null);
  const dayPanelId = useId();
  const scrollerRef = useRef<HTMLDivElement>(null);
  const p = t.plan.panel;
  const { brief, itinerary } = state;

  // Picking a pin on the map brings its card into view. `"nearest"` moves the
  // panel's own scroller only as far as it must, so picking the card instead —
  // it is already on screen — scrolls nothing.
  useEffect(() => {
    if (!selectedStopId) return;
    const rows = scrollerRef.current?.querySelectorAll<HTMLElement>("[data-stop-row]") ?? [];
    for (const row of rows) {
      if (row.dataset.stopRow !== selectedStopId) continue;
      row.scrollIntoView?.({ block: "nearest" });
      return;
    }
  }, [selectedStopId]);

  const isStaySlot = (slot: Slot) => slot.day === STAY_SLOT.day;

  const groupFor = (slot: Slot): OptionGroupState | null => {
    const groups = Object.values(state.groups);
    const matching = isStaySlot(slot)
      ? groups.filter((group) => group.kind === "hotel")
      : groups.filter(
          (group) =>
            group.slot !== null &&
            group.slot.day === slot.day &&
            partOf(group.slot) === partOf(slot)
        );
    return matching[matching.length - 1] ?? null;
  };

  const currentIdsFor = (slot: Slot): string[] => {
    if (isStaySlot(slot)) return itinerary.stay ? [itinerary.stay.id] : [];
    const day = itinerary.days.find((d) => d.day === slot.day);
    return day ? day.slots[partOf(slot)].map((card) => card.id) : [];
  };

  const changingGroup = changing ? groupFor(changing) : null;

  // "Change" asks for the slot's options itself, once per opening: nobody
  // should meet an empty sheet and have to click again.
  const askedForRef = useRef<string | null>(null);
  useEffect(() => {
    if (!changing) {
      askedForRef.current = null;
      return;
    }
    const key = `${changing.day}:${partOf(changing)}`;
    if (changingGroup || askedForRef.current === key) return;
    askedForRef.current = key;
    onAskAlternatives(changing);
  }, [changing, changingGroup, onAskAlternatives]);

  const sheet = (
    <AlternativesSheet
      open={changing !== null}
      slot={changing}
      group={changingGroup}
      currentIds={changing ? currentIdsFor(changing) : []}
      shortlist={state.shortlist}
      disabled={state.status === "streaming"}
      loading={state.status === "streaming"}
      onClose={() => setChanging(null)}
      onSelect={onSelect}
      onDismiss={onDismiss}
      onToggleShortlist={onToggleShortlist}
      onAskMore={onAskAlternatives}
    />
  );

  if (!hasItinerary(itinerary)) {
    return (
      <div className="flex h-full flex-col gap-4 overflow-y-auto p-4">
        <BriefChecklist
          brief={brief}
          missing={state.missing}
          disabled={state.status === "streaming"}
          onGenerate={onGenerate}
        />
      </div>
    );
  }

  const dayCount = daysBetween(brief.start_date, brief.end_date) ?? itinerary.days.length;
  const heading = brief.destination
    ? interpolate(p.heading, { count: dayCount, destination: brief.destination })
    : p.headingNoDestination;

  const experiences = itinerary.days.reduce(
    (total, day) => total + DAY_PARTS.reduce((sum, part) => sum + day.slots[part].length, 0),
    0
  );

  const counters = [
    itinerary.days.length === 1 ? p.dayOne : interpolate(p.days, { count: itinerary.days.length }),
    experiences === 1 ? p.experienceOne : interpolate(p.experiences, { count: experiences }),
    itinerary.stay ? p.hotel : null,
    itinerary.route ? (routeLegs(itinerary.route) === 1 ? p.legOne : interpolate(p.legs, { count: 2 })) : null,
  ].filter((entry): entry is string => !!entry);

  const globalWarnings = itinerary.warnings.filter((warning) => warning.slot === null);

  // The page owns the selected day; one that no longer exists (the itinerary
  // shrank between renders) falls back to the first day of the trip.
  const day = itinerary.days.find((d) => d.day === selectedDay) ?? itinerary.days[0] ?? null;
  const currentDay = day?.day ?? selectedDay;
  const stayStop = mapStops.find((stop) => stop.kind === "stay") ?? null;

  return (
    <div ref={scrollerRef} className="flex h-full flex-col gap-4 overflow-y-auto p-4">
      <header className="flex animate-fade-up flex-wrap items-start gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="text-[10px] font-medium uppercase tracking-wider text-text-secondary">
            {p.draft}
          </span>
          <h2 className="text-2xl font-medium leading-tight text-text-primary">{heading}</h2>
          <p className="text-xs text-text-secondary">{counters.join(" · ")}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button
            size="sm"
            disabled
            aria-disabled="true"
            title={p.saveHint}
            className="px-4 py-2 text-xs opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
          >
            {p.save}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={onReset}
            className="px-3 py-2 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
          >
            {p.reset}
          </Button>
        </div>
      </header>

      {globalWarnings.length > 0 && (
        <div className="flex flex-col gap-2">
          {globalWarnings.map((warning) => (
            <WarningBadge key={`${warning.code}:${warning.message}`} warning={warning} />
          ))}
        </div>
      )}

      {itinerary.route && <RouteStrip route={itinerary.route} />}

      {itinerary.stay && (
        <StayCard
          stay={itinerary.stay}
          nights={brief.nights}
          stopId={stayStop?.id ?? null}
          selected={stayStop !== null && stayStop.id === selectedStopId}
          onSelectStop={onSelectStop}
          onChange={() => setChanging(STAY_SLOT)}
        />
      )}

      {itinerary.days.length > 0 && (
        <DayStrip
          days={itinerary.days}
          startDate={brief.start_date}
          selectedDay={currentDay}
          panelId={dayPanelId}
          onSelect={onSelectDay}
        />
      )}

      {day && (
        <div id={dayPanelId} role="tabpanel" aria-label={interpolate(p.day, { day: day.day })}>
          {/* Keyed by day: switching remounts the card and replays its entrance. */}
          <DayCard
            key={day.day}
            day={day}
            date={dateForDay(brief.start_date, day.day)}
            warnings={itinerary.warnings}
            mapStops={mapStops}
            selectedStopId={selectedStopId}
            onSelectStop={onSelectStop}
            static
            onChange={(slot) => setChanging(slot)}
            onRemove={onRemove}
          />
        </div>
      )}

      <p className="pb-2 text-xs text-text-secondary">{p.priceNote}</p>

      {sheet}
    </div>
  );
}
