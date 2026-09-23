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

  const shownDay = selected === null ? null : (itinerary.days.find((d) => d.day === selected) ?? null);

  // The day opens below a long overview: bring it into view.
  useEffect(() => {
    if (shownDay) dayRef.current?.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
  }, [shownDay]);

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
        <TripOverview
          itinerary={itinerary}
          brief={brief}
          city={city}
          onSelectDay={(day) => setSelected((current) => (current === day ? null : day))}
        />
      )}

      {shownDay && (
        <section
          ref={dayRef}
          aria-labelledby="admin-trip-day"
          data-admin-day={shownDay.day}
          className="flex flex-col gap-2"
        >
          <div className="flex items-center justify-between gap-3">
            <h3 id="admin-trip-day" className="text-base font-medium text-text-primary">
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
