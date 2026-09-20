"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { useLanguage } from "@/context/LanguageContext";
import { interpolate } from "@/i18n";
import {
  hasItinerary,
  partOf,
  type DayDraft,
  type OptionGroupState,
  type PlannerState,
} from "@/hooks/plannerReducer";
import { useCardDetail } from "@/hooks/useCardDetail";
import { DAY_PARTS, type OptionCard, type Slot } from "@/types/planner";
import { routeLegs } from "./RouteStrip";
import { ActivityDetail } from "./ActivityDetail";
import { AlternativesSheet } from "./AlternativesSheet";
import { BriefChecklist } from "./BriefChecklist";
import { DayCard } from "./DayCard";
import { DayStrip } from "./DayStrip";
import { stayStopId, stopId, type MapStop } from "./mapStops";
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

/** One card of the itinerary and where it sits: what a selected stop resolves to. */
interface OpenedStop {
  card: OptionCard;
  slot: Slot;
}

/**
 * The card a selected stop came from — the stay, or one card of the day on
 * screen — or `null` when the id belongs to neither, which is what makes a pin
 * of another day stop matching and the detail close by itself. Pure, and it
 * reads the same ids the map does (`mapStops`).
 */
function openedStop(
  stay: OptionCard | null,
  day: DayDraft | null,
  selectedStopId: string | null
): OpenedStop | null {
  if (!selectedStopId) return null;
  if (stay && stayStopId(stay.id) === selectedStopId) return { card: stay, slot: STAY_SLOT };
  if (!day) return null;
  for (const part of DAY_PARTS) {
    for (const card of day.slots[part]) {
      if (stopId(day.day, part, card.id) === selectedStopId) {
        return { card, slot: { day: day.day, part } };
      }
    }
  }
  return null;
}

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

  // Picking a pin on the map brings what it selected into view: the stay's
  // card, which stays on screen, or the activity's page, which replaced the
  // day. `"nearest"` moves the panel's own scroller only as far as it must, so
  // picking something already in sight scrolls nothing.
  useEffect(() => {
    if (!selectedStopId) return;
    const rows = scrollerRef.current?.querySelectorAll<HTMLElement>("[data-stop-row]") ?? [];
    for (const row of rows) {
      if (row.dataset.stopRow !== selectedStopId) continue;
      row.scrollIntoView?.({ block: "nearest" });
      return;
    }
    scrollerRef.current?.querySelector("[data-activity-detail]")?.scrollIntoView?.({
      block: "nearest",
    });
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

  // The day on screen: the selected one, or the first when the itinerary
  // shrank between renders and the selected day no longer exists.
  const shownDay =
    itinerary.days.find((d) => d.day === selectedDay) ?? itinerary.days[0] ?? null;
  const currentDay = shownDay?.day ?? selectedDay;

  // The stop the traveller opened, resolved back to the card it came from:
  // the stay, or one card of the day on screen. A pin of another day cannot
  // match, which is what makes changing the day close the detail by itself.
  const selection = openedStop(itinerary.stay, shownDay, selectedStopId);

  const { detail, status } = useCardDetail(selection?.card.id ?? null);

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
          stop={stayStop}
          selectedStopId={selectedStopId}
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

      {(selection || shownDay) && (
        <div id={dayPanelId} role="tabpanel" aria-label={interpolate(p.day, { day: currentDay })}>
          {selection ? (
            /* The middle column is the activity's page while one is open; the
               day strip above it stays, so another day is always one click
               away (and clears the selection with it). */
            <ActivityDetail
              key={selectedStopId}
              card={selection.card}
              slot={selection.slot}
              detail={detail}
              status={status}
              onBack={() => onSelectStop(null)}
              onChange={(slot) => setChanging(slot)}
              onRemove={(slot, cardId) => {
                onSelectStop(null);
                onRemove(slot, cardId);
              }}
            />
          ) : (
            shownDay && (
              /* Keyed by day: switching remounts the card and replays its entrance. */
              <DayCard
                key={shownDay.day}
                day={shownDay}
                date={dateForDay(brief.start_date, shownDay.day)}
                warnings={itinerary.warnings}
                mapStops={mapStops}
                selectedStopId={selectedStopId}
                onSelectStop={onSelectStop}
                static
                onChange={(slot) => setChanging(slot)}
                onRemove={onRemove}
              />
            )
          )}
        </div>
      )}

      <p className="pb-2 text-xs text-text-secondary">{p.priceNote}</p>

      {sheet}
    </div>
  );
}
