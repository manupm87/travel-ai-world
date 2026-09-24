"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { HEADER_SLOT_ID } from "@/components/layout/Header";
import { useLanguage } from "@/context/LanguageContext";
import { interpolate } from "@/i18n";
import {
  groupForSlot,
  hasItinerary,
  partOf,
  type DayDraft,
  type OptionGroupState,
  type PlannerState,
} from "@/hooks/plannerReducer";
import { useBriefValues } from "@/hooks/useBriefValues";
import { useCardDetail } from "@/hooks/useCardDetail";
import type { AskAlternativesOptions } from "@/hooks/usePlanner";
import type { UseSaveTripResult } from "@/hooks/useSaveTrip";
import { DAY_PARTS, type OptionCard, type PlannerCity, type Slot } from "@/types/planner";
import { routeLegs } from "./RouteStrip";
import { ActivityDetail } from "./ActivityDetail";
import { AlternativesSheet } from "./AlternativesSheet";
import { BriefChecklist } from "./BriefChecklist";
import { DayCard } from "./DayCard";
import { DayStrip } from "./DayStrip";
import type { LockedPhase } from "./LockedNotice";
import { OpenTripNotice, type OpenTripState } from "./OpenTripNotice";
import { stayStopId, stopId, type MapStop } from "./mapStops";
import { RouteStrip } from "./RouteStrip";
import { StayCard } from "./StayCard";
import { TripHeader } from "./TripHeader";
import { TripOverview } from "./TripOverview";
import { dateForDay, daysBetween } from "@/utils/tripDates";
import { WarningBadge } from "./WarningBadge";

export interface TripPanelProps {
  state: PlannerState;
  /**
   * The day the strip, the day card and the map slot are showing, or `null`
   * for the trip overview (TRA-177) — where an itinerary always opens.
   */
  selectedDay: number | null;
  onSelectDay: (day: number | null) => void;
  /** The destination as `ai_api` publishes it (photo, intro), or `null`. */
  city: PlannerCity | null;
  /** The pins of that day (`toMapStops`), so the cards carry their numbers. */
  mapStops: MapStop[];
  /** The pin selected on the map, `null` for none. */
  selectedStopId: string | null;
  onSelectStop: (id: string | null) => void;
  onGenerate: () => void;
  onRemove: (slot: Slot, cardId: string) => void;
  onSelect: (groupId: string, cardIds: string[], slot?: Slot) => void;
  onDismiss: (groupId: string, cardId: string) => void;
  onToggleShortlist: (cardId: string) => void;
  onAskAlternatives: (slot: Slot, options?: AskAlternativesOptions) => void;
  onReset: () => void;
  /**
   * "New trip" (TRA-223): leaves the trip on screen for an empty planner at a
   * bare `/plan/`. The header offers it while a saved trip is open and can
   * still be planned, and the pane beside a trip that is not there; a locked
   * trip has `LockedNotice`'s instead.
   */
  onNewTrip?: () => void;
  /**
   * What `/plan/?trip=` is doing, when the URL names one: the pane says so
   * instead of the page going blank. `null` once the trip is in the planner,
   * and for a planner that opened no trip at all.
   */
  openTrip?: OpenTripState | null;
  /**
   * The trip on screen is happening now or is over: it is read, not planned.
   * Every control core_api would refuse goes away — Save, "Start over",
   * "Change", "Remove" and the sheet behind them — and the header says which
   * of the two it is instead of calling it a draft.
   */
  lockedPhase?: LockedPhase | null;
  /** "Save trip": what `hooks/useSaveTrip.ts` knows and the one action it offers. */
  save: UseSaveTripResult;
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
 * then the draft trip (route, stay, the day strip and, below it, the trip
 * overview or the one day the strip has selected) and the alternatives sheet
 * the "Change" buttons open. The map is the column beside it (`TripMap`); what
 * they share is `mapStops`, which gives every card here the number of its pin
 * there — and which is empty while the overview is on screen, because there is
 * no day to map. The panel owns nothing but the sheet: every mutation, the
 * selected day and the selected pin included, is a callback the page turns
 * into a planner action.
 */
export function TripPanel({
  state,
  selectedDay,
  onSelectDay,
  city,
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
  onNewTrip,
  openTrip = null,
  lockedPhase = null,
  save,
}: TripPanelProps) {
  const { t } = useLanguage();
  const [changing, setChanging] = useState<Slot | null>(null);
  const dayPanelId = useId();
  const scrollerRef = useRef<HTMLDivElement>(null);
  const p = t.plan.panel;
  const { brief, itinerary } = state;
  const briefValues = useBriefValues(brief);

  // The app header's slot, where the trip bar goes on a desktop (TRA-244). It
  // is rendered by the layout, before the page, so it is there on mount.
  const [headerSlot, setHeaderSlot] = useState<HTMLElement | null>(null);
  useEffect(() => {
    const found = document.getElementById(HEADER_SLOT_ID);
    const id = window.setTimeout(() => setHeaderSlot(found), 0);
    return () => window.clearTimeout(id);
  }, []);

  // Picking a pin on the map brings what it selected into view: the stay's
  // card, which stays on screen, or the activity's page, which replaced the
  // day. `"nearest"` moves the panel's own scroller only as far as it must, so
  // picking something already in sight scrolls nothing.
  //
  // Closing does the opposite for the keyboard: the activity's page unmounted
  // the way back with itself, so focus would fall to the body. It goes to the
  // row the activity was opened from — the button the traveller pressed —
  // which is where Tab should carry on from (the detail does the same on the
  // way in, `ActivityDetail`'s mount effect).
  const openedRef = useRef<string | null>(null);
  useEffect(() => {
    const previous = openedRef.current;
    openedRef.current = selectedStopId;
    const rows = scrollerRef.current?.querySelectorAll<HTMLElement>("[data-stop-row]") ?? [];
    const rowFor = (id: string) => {
      for (const row of rows) if (row.dataset.stopRow === id) return row;
      return null;
    };

    if (!selectedStopId) {
      // Nothing was open (first render, another day cleared it, the card was
      // removed): there is no row to go back to.
      const row = previous ? rowFor(previous) : null;
      row?.querySelector<HTMLButtonElement>("button")?.focus({ preventScroll: true });
      row?.scrollIntoView?.({ block: "nearest" });
      return;
    }

    const row = rowFor(selectedStopId);
    if (row) {
      row.scrollIntoView?.({ block: "nearest" });
      return;
    }
    scrollerRef.current?.querySelector("[data-activity-detail]")?.scrollIntoView?.({
      block: "nearest",
    });
  }, [selectedStopId]);

  // Opening a day starts at the top of the panel. The overview is tall and its
  // day rows sit right at the bottom of it, so without this the day arrives
  // with the strip — the one way back to the whole trip — scrolled off screen.
  // An activity opening at the same time has its own scrolling above.
  const scrolledDayRef = useRef(selectedDay);
  useEffect(() => {
    if (scrolledDayRef.current === selectedDay) return;
    scrolledDayRef.current = selectedDay;
    if (selectedStopId === null) scrollerRef.current?.scrollTo?.({ top: 0 });
  }, [selectedDay, selectedStopId]);

  const isStaySlot = (slot: Slot) => slot.day === STAY_SLOT.day;

  const groupFor = (slot: Slot): OptionGroupState | null => {
    if (!isStaySlot(slot)) return groupForSlot(state.groups, slot);
    const hotels = Object.values(state.groups).filter((group) => group.kind === "hotel");
    return hotels[hotels.length - 1] ?? null;
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
    if ((changingGroup && changingGroup.cards.length > 0) || askedForRef.current === key) {
      return;
    }
    askedForRef.current = key;
    onAskAlternatives(changing);
  }, [changing, changingGroup, onAskAlternatives]);

  // The day on screen, or `null` for the overview — which is also what a day
  // that no longer exists falls back to, between the render that shrank the
  // itinerary and the one `useSelectedDay` corrects.
  const shownDay =
    selectedDay === null ? null : (itinerary.days.find((d) => d.day === selectedDay) ?? null);
  const currentDay = shownDay?.day ?? null;

  // The stop the traveller opened, resolved back to the card it came from:
  // the stay, or one card of the day on screen. Nothing can match on the
  // overview and a pin of another day cannot match either, which is what makes
  // changing the day — or going back to the whole trip — close the detail.
  const selection =
    currentDay === null ? null : openedStop(itinerary.stay, shownDay, selectedStopId);

  const { detail, status } = useCardDetail(selection?.card.id ?? null);

  // The panel the day tabs point at. The stay belongs to no day, so while its
  // page is the one on screen the panel says so: named after the selected day
  // it would tell a screen reader it is reading "Day 1" when it is reading a
  // hotel that is the same on every day of the trip.
  const panelLabel =
    selection && isStaySlot(selection.slot)
      ? p.stayNoNights
      : currentDay === null
        ? p.overview
        : interpolate(p.day, { day: currentDay });

  const sheet = lockedPhase ? null : (
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
      onAskAlternatives={onAskAlternatives}
    />
  );

  if (openTrip) {
    return (
      <div className="flex h-full flex-col gap-4 scrollbar-none overflow-y-auto overscroll-y-contain p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <OpenTripNotice state={openTrip} onNewTrip={onNewTrip} />
      </div>
    );
  }

  if (!hasItinerary(itinerary)) {
    // Nothing said yet: the pane says what it is for and waits. It lists no
    // trips — those live on the home (`/dashboard/`, TRA-201) — and the
    // checklist takes its place as soon as the conversation starts.
    const started = state.messages.length > 0;
    return (
      <div className="flex h-full flex-col gap-4 scrollbar-none overflow-y-auto overscroll-y-contain p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        {started ? (
          <BriefChecklist
            brief={brief}
            missing={state.missing}
            disabled={state.status === "streaming"}
            onGenerate={onGenerate}
          />
        ) : (
          <div className="flex flex-1 animate-fade-up flex-col items-start justify-center gap-2 px-1">
            <h2 className="text-xl font-medium leading-tight text-text-primary">
              {p.emptyTitle}
            </h2>
            <p className="text-sm leading-relaxed text-text-secondary">{p.emptyDescription}</p>
          </div>
        )}
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

  const barSummary = [briefValues.dates?.split(" · ")[0] ?? null, briefValues.travellers]
    .filter((entry): entry is string => !!entry)
    .join(", ");

  const globalWarnings = itinerary.warnings.filter((warning) => warning.slot === null);

  // The day after the one on screen, which the day card offers at its foot.
  const nextDay =
    shownDay === null ? null : (itinerary.days.find((d) => d.day === shownDay.day + 1) ?? null);

  const stayStop = mapStops.find((stop) => stop.kind === "stay") ?? null;

  return (
    <div
      ref={scrollerRef}
      className="flex h-full flex-col gap-4 scrollbar-none overflow-y-auto overscroll-y-contain p-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
    >
      {/* The trip's name and its actions: in the app header on a desktop,
          as the canvas has it, and on top of the pane below that. */}
      <TripHeader
        variant="panel"
        className="lg:hidden"
        heading={heading}
        summary={counters.join(" · ")}
        lockedPhase={lockedPhase}
        save={save}
        onNewTrip={onNewTrip}
        onReset={onReset}
      />
      {headerSlot &&
        createPortal(
          <TripHeader
            variant="bar"
            className="hidden lg:flex"
            heading={heading}
            summary={barSummary}
            lockedPhase={lockedPhase}
            save={save}
            onNewTrip={onNewTrip}
            onReset={onReset}
          />,
          headerSlot
        )}

      {globalWarnings.length > 0 && (
        <div className="flex flex-col gap-2">
          {globalWarnings.map((warning) => (
            <WarningBadge key={`${warning.code}:${warning.message}`} warning={warning} />
          ))}
        </div>
      )}

      {/* The route leads the overview; a day starts with the day. */}
      {currentDay === null && itinerary.route && <RouteStrip route={itinerary.route} />}

      {currentDay === null && itinerary.stay && (
        <StayCard
          stay={itinerary.stay}
          nights={brief.nights}
          stop={stayStop}
          selectedStopId={selectedStopId}
          // Nothing to select on the overview: no day is on screen, so no map
          // and no activity page to open. The card is plain text and "Change".
          onChange={lockedPhase ? undefined : () => setChanging(STAY_SLOT)}
        />
      )}

      {itinerary.days.length > 0 && (
        // The tabs stay in reach while a long day scrolls under them.
        <div className="sticky -top-4 z-10 -mx-4 -mt-4 bg-bg-secondary/90 px-4 pt-4 pb-1 backdrop-blur-md">
          <DayStrip
            days={itinerary.days}
            startDate={brief.start_date}
            selectedDay={currentDay}
            panelId={dayPanelId}
            onSelect={onSelectDay}
          />
        </div>
      )}

      <div id={dayPanelId} role="tabpanel" aria-label={panelLabel}>
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
            onChange={lockedPhase ? undefined : (slot) => setChanging(slot)}
            onRemove={
              lockedPhase
                ? undefined
                : (slot, cardId) => {
                    onSelectStop(null);
                    onRemove(slot, cardId);
                  }
            }
          />
        ) : shownDay ? (
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
            onChange={lockedPhase ? undefined : (slot) => setChanging(slot)}
            onRemove={lockedPhase ? undefined : onRemove}
            next={
              nextDay && {
                day: nextDay.day,
                title: nextDay.title ?? null,
                date: dateForDay(brief.start_date, nextDay.day),
              }
            }
            onNext={nextDay ? () => onSelectDay(nextDay.day) : undefined}
          />
        ) : (
          /* No day selected: the whole trip, across this column and the one
             the map would have taken (TRA-177). */
          <TripOverview
            itinerary={itinerary}
            brief={brief}
            city={city}
            onSelectDay={onSelectDay}
          />
        )}
      </div>

      {/* Where the night is spent, one line under the day (the overview has
          the whole card). */}
      {currentDay !== null && itinerary.stay && (
        <StayCard
          compact
          stay={itinerary.stay}
          nights={brief.nights}
          stop={stayStop}
          selectedStopId={selectedStopId}
          onSelectStop={onSelectStop}
          onChange={lockedPhase ? undefined : () => setChanging(STAY_SLOT)}
        />
      )}

      <p className="pb-2 text-xs text-text-secondary">{p.priceNote}</p>

      {sheet}
    </div>
  );
}
