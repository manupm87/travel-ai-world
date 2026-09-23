"use client";

import { X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { DayCard } from "@/components/planner/v2/DayCard";
import { RouteStrip } from "@/components/planner/v2/RouteStrip";
import { StayCard } from "@/components/planner/v2/StayCard";
import { TripOverview } from "@/components/planner/v2/TripOverview";
import { useLanguage } from "@/context/LanguageContext";
import type { ItineraryDraft } from "@/hooks/plannerReducer";
import { interpolate } from "@/i18n";
import type { PlannerCity, TripBrief } from "@/types/planner";
import { dateForDay } from "@/utils/tripDates";

export interface AdminTripViewProps {
  itinerary: ItineraryDraft;
  brief: TripBrief;
  /** The trip's city as `ai_api` publishes it, or `null` when it is unknown. */
  city: PlannerCity | null;
}

/**
 * The trip as the planner shows it, read only (TRA-229): the route, the stay,
 * then the planner's own overview — photo, "About", the places and the list of
 * days. A day's row toggles that day's cards below the overview, in the
 * locked form a past trip gets in the planner: no "Change", no "Remove", no
 * alternatives, nothing to select. The map is not rendered.
 */
export function AdminTripView({ itinerary, brief, city }: AdminTripViewProps) {
  const { t } = useLanguage();
  const tt = t.admin.trip;
  const [selected, setSelected] = useState<number | null>(null);
  const dayRef = useRef<HTMLElement | null>(null);
  const headingRef = useRef<HTMLHeadingElement | null>(null);
  const overviewRef = useRef<HTMLDivElement | null>(null);
  const openedRef = useRef<number | null>(null);

  const shownDay = selected === null ? null : (itinerary.days.find((d) => d.day === selected) ?? null);

  // The day opens below a long overview, after the whole list of days: focus
  // moves to its heading, so Tab carries on into its cards and a screen reader
  // hears where it went, and the section is brought into view. No `behavior`:
  // the global reduced-motion rule decides how it scrolls.
  //
  // Closing it unmounts the focused "Close" button with it, so focus would fall
  // to the body: it goes back to the day's row instead, as `TripPanel` does.
  useEffect(() => {
    const previous = openedRef.current;
    openedRef.current = selected;
    if (selected !== null) {
      headingRef.current?.focus({ preventScroll: true });
      dayRef.current?.scrollIntoView?.({ block: "nearest" });
      return;
    }
    if (previous === null) return;
    const index = itinerary.days.findIndex((d) => d.day === previous);
    const rows = overviewRef.current?.querySelectorAll<HTMLButtonElement>("li > button");
    const row = index >= 0 ? rows?.[index] : undefined;
    row?.focus({ preventScroll: true });
    row?.scrollIntoView?.({ block: "nearest" });
  }, [selected, itinerary.days]);

  return (
    <section aria-labelledby="admin-trip-itinerary" className="mb-8 flex flex-col gap-4">
      <h2 id="admin-trip-itinerary" className="text-lg text-text-primary">
        {tt.itinerary}
      </h2>

      {itinerary.route && <RouteStrip route={itinerary.route} />}
      {itinerary.stay && <StayCard stay={itinerary.stay} nights={brief.nights} />}

      {itinerary.days.length === 0 ? (
        <p className="text-sm text-text-secondary">{tt.noDays}</p>
      ) : (
        <div ref={overviewRef}>
          <TripOverview
            itinerary={itinerary}
            brief={brief}
            city={city}
            onSelectDay={(day) => setSelected((current) => (current === day ? null : day))}
          />
        </div>
      )}

      {shownDay && (
        <section
          ref={dayRef}
          aria-labelledby="admin-trip-day"
          data-admin-day={shownDay.day}
          className="flex flex-col gap-2"
        >
          <div className="flex items-center justify-between gap-3">
            <h3
              ref={headingRef}
              id="admin-trip-day"
              tabIndex={-1}
              className="text-base font-medium text-text-primary focus:outline-none"
            >
              {interpolate(tt.dayHeading, { day: shownDay.day })}
            </h3>
            <button
              type="button"
              onClick={() => setSelected(null)}
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm text-text-secondary hover:bg-bg-surface hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
            >
              <X size={14} aria-hidden="true" />
              {tt.closeDay}
            </button>
          </div>
          {/* Keyed by day: switching remounts the card and replays its entrance. */}
          <DayCard
            key={shownDay.day}
            day={shownDay}
            date={dateForDay(brief.start_date, shownDay.day)}
            warnings={itinerary.warnings}
            static
          />
        </section>
      )}
    </section>
  );
}
