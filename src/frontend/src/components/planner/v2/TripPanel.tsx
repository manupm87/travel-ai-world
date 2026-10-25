"use client";

/** The planner's trip panel: the overview, a day or an activity. */

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
  /** The day on screen, or `null` for the trip overview, where an itinerary opens. */
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
  /** "New trip": an empty planner at a bare `/plan/`; a locked trip uses `LockedNotice`'s. */
  onNewTrip?: () => void;
  /** What loading `/plan/?trip=` is doing; `null` once the trip is in, or when none was named. */
  openTrip?: OpenTripState | null;
  /**
   * The trip is under way or over: every control core_api would refuse (Save,
   * "Start over", "Change", "Remove" and the sheet) goes away.
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
 * The card a selected stop came from (the stay or a card of the day on screen),
 * or `null`: a pin of another day matches nothing, so the detail closes.
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
 * The trip pane: the brief checklist until an itinerary exists, then the trip
 * (overview or one day) and the alternatives sheet. It owns only the sheet;
 * every mutation, the selected day and pin included, is a callback.
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

  // the app header's slot for the desktop trip bar; the layout renders it before the page
  const [headerSlot, setHeaderSlot] = useState<HTMLElement | null>(null);
  useEffect(() => {
    const found = document.getElementById(HEADER_SLOT_ID);
    const id = window.setTimeout(() => setHeaderSlot(found), 0);
    return () => window.clearTimeout(id);
  }, []);

  // a picked pin scrolls its row or the activity's page into view (`"nearest"` scrolls
  // only as far as needed); closing the activity returns focus to the row it was opened
  // from, since the back button unmounted with the page and focus would fall to the body
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

  // a day opens at the top: the overview's day rows sit at its bottom, which would
  // leave the strip scrolled off screen
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

  // "Change" asks for the slot's options itself, once per opening, so the sheet is never empty
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

  // a selected day missing from the itinerary shows the overview until `useSelectedDay` corrects it
  const shownDay =
    selectedDay === null ? null : (itinerary.days.find((d) => d.day === selectedDay) ?? null);
  const currentDay = shownDay?.day ?? null;

  // nothing matches on the overview, so changing day or going back closes the detail
  const selection =
    currentDay === null ? null : openedStop(itinerary.stay, shownDay, selectedStopId);

  const { detail, status } = useCardDetail(selection?.card.id ?? null);

  // the stay belongs to no day, so while its page is open the tab panel is not named after one
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
    // before the first message an empty state; saved trips live on `/dashboard/`, not here
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

  const nextDay =
    shownDay === null ? null : (itinerary.days.find((d) => d.day === shownDay.day + 1) ?? null);

  const stayStop = mapStops.find((stop) => stop.kind === "stay") ?? null;

  return (
    <div
      ref={scrollerRef}
      className="flex h-full flex-col gap-4 scrollbar-none overflow-y-auto overscroll-y-contain p-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
    >
      {/* in the app header on a desktop, on top of the pane below `lg` */}
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

      {currentDay === null && itinerary.route && <RouteStrip route={itinerary.route} />}

      {currentDay === null && itinerary.stay && (
        <StayCard
          stay={itinerary.stay}
          nights={brief.nights}
          stop={stayStop}
          selectedStopId={selectedStopId}
          // no `onSelectStop` on the overview: there is no day pin or activity page to open
          onChange={lockedPhase ? undefined : () => setChanging(STAY_SLOT)}
        />
      )}

      {itinerary.days.length > 0 && (
        // the tabs stay in reach while a long day scrolls under them
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
          /* keyed by day: switching remounts the card and replays its entrance */
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
          <TripOverview
            itinerary={itinerary}
            brief={brief}
            city={city}
            onSelectDay={onSelectDay}
          />
        )}
      </div>

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
