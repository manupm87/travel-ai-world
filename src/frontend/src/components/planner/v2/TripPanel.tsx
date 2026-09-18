"use client";

import { useState } from "react";
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
import { MapPlaceholder } from "./MapPlaceholder";
import { RouteStrip } from "./RouteStrip";
import { StayCard } from "./StayCard";
import { WarningBadge } from "./WarningBadge";

export interface TripPanelProps {
  state: PlannerState;
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

const MS_PER_DAY = 86_400_000;

/** `YYYY-MM-DD` at UTC midnight, so no timezone can shift a day. */
function parseIsoDate(iso: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return null;
  return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

/** The ISO date of day `day` (1-based) of a trip starting on `start`. */
function dateForDay(start: string | null, day: number): string | null {
  if (!start) return null;
  const base = parseIsoDate(start);
  if (base === null) return null;
  return new Date(base + (day - 1) * MS_PER_DAY).toISOString().slice(0, 10);
}

/** Nights + 1, from the brief's dates; `null` when they are not both known. */
function daysBetween(start: string | null, end: string | null): number | null {
  if (!start || !end) return null;
  const from = parseIsoDate(start);
  const to = parseIsoDate(end);
  if (from === null || to === null || to < from) return null;
  return Math.round((to - from) / MS_PER_DAY) + 1;
}

/**
 * The planner's right column: the brief checklist until an itinerary exists,
 * then the draft trip (route, map, stay, days) and the alternatives sheet the
 * "Change" buttons open. It owns nothing but that sheet: every mutation is a
 * callback the page turns into a planner action.
 */
export function TripPanel({
  state,
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
  const p = t.plan.panel;
  const { brief, itinerary } = state;

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

  const sheet = (
    <AlternativesSheet
      open={changing !== null}
      slot={changing}
      group={changing ? groupFor(changing) : null}
      currentIds={changing ? currentIdsFor(changing) : []}
      shortlist={state.shortlist}
      disabled={state.status === "streaming"}
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

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto p-4">
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

      <div className="animate-fade-up">
        <MapPlaceholder itinerary={itinerary} />
      </div>

      {itinerary.stay && (
        <StayCard
          stay={itinerary.stay}
          nights={brief.nights}
          onChange={() => setChanging(STAY_SLOT)}
        />
      )}

      {itinerary.days.map((day, index) => (
        <DayCard
          key={day.day}
          day={day}
          date={dateForDay(brief.start_date, day.day)}
          warnings={itinerary.warnings}
          defaultOpen={index === 0}
          index={index}
          onChange={(slot) => setChanging(slot)}
          onRemove={onRemove}
        />
      ))}

      <p className="pb-2 text-xs text-text-secondary">{p.priceNote}</p>

      {sheet}
    </div>
  );
}
