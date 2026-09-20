"use client";

import React, { useState } from "react";
import { Section } from "@/components/ui/Section";
import { Trip } from "@/types/trip";
import { getFlag } from "@/utils/countryFlag";
import { useLanguage } from "@/context/LanguageContext";
import { interpolate } from "@/i18n";
import { DayCard } from "./DayCard";

interface ItineraryProps {
  trip: Trip;
}


/**
 * The day-by-day itinerary (`trip-viewer`).
 *
 * A sticky row of destination filters over the days themselves, one `DayCard`
 * each. The row is glass rather than an opaque band, so the aurora keeps
 * running under the whole page (TRA-193).
 *
 * @param trip - The complete Trip data object.
 */
export default function Itinerary({ trip }: ItineraryProps) {
  const { t } = useLanguage();
  const [filter, setFilter] = useState<string>("all");
  
  const getDestinationFlag = (destId: string) => {
    const code = trip.destinations.find(d => d.id === destId)?.countryCode;
    return code ? getFlag(code) : "";
  };

  const filteredItinerary = trip.itinerary.filter(day => {
    if (filter === "all") return true;
    return day.destinationId === filter;
  });

  return (
    <Section variant="transparent" padding="large">
      <div className="flex flex-col gap-8">
        {/* Destination Filters (Sticky) */}
        {/* The bleed has to match `Container`'s own padding, or the blurred strip
            stops short of the edge on one side (TRA-187). */}
        <div className="sticky top-(--header-h) z-30 py-4 bg-glass-bg backdrop-blur-xl -mx-8 px-8 lg:-mx-16 lg:px-16 border-b border-glass-border">
          {/* One scrolling row on a phone: wrapped to two rows the sticky bar is
              ~130 px tall and eats the day it is meant to filter. */}
          <div className="flex gap-3 overflow-x-auto md:flex-wrap md:overflow-visible [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <button 
              onClick={() => setFilter("all")}
              aria-pressed={filter === "all"}
              className={`shrink-0 whitespace-nowrap px-5 py-2.5 rounded-full text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 ${
                filter === "all" ? "bg-accent text-white" : "border border-glass-border bg-glass-bg text-text-secondary hover:text-text-primary"
              }`}
            >
              {t.tripViewer.allDays}
            </button>
            {trip.destinations.map(dest => (
              <button
                key={dest.id}
                onClick={() => setFilter(dest.id)}
                aria-pressed={filter === dest.id}
                className={`flex shrink-0 items-center gap-2 whitespace-nowrap rounded-full px-5 py-2.5 text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 ${
                  filter === dest.id ? "bg-accent text-white" : "border border-glass-border bg-glass-bg text-text-secondary hover:text-text-primary"
                }`}
              >
                <span className="font-normal" aria-hidden="true">{getDestinationFlag(dest.id)}</span>
                <span>{dest.city}</span>
              </button>
            ))}
          </div>
        </div>

        <h2 className="text-3xl leading-[1.1] font-light text-text-primary md:text-[42px]">
          {interpolate(t.tripViewer.journeyTitle, { duration: trip.dates.durationDays })}
        </h2>

        <div className="flex flex-col gap-4 mt-4">
          {filteredItinerary.map((day, idx) => {
            // Find if this is the first day of a destination for anchoring
            const isFirstDayOfDest = idx === 0 || filteredItinerary[idx - 1]?.destinationId !== day.destinationId;
            
            return (
              <div 
                key={day.dayNumber} 
                id={isFirstDayOfDest ? `dest-${day.destinationId}` : undefined}
                className="scroll-mt-[140px] md:scroll-mt-[180px]" // Sticky header + the filter row (one line on a phone)
              >
                <DayCard day={day} currency={trip.budget.currency} />
              </div>
            );
          })}
        </div>
      </div>
    </Section>
  );
}
