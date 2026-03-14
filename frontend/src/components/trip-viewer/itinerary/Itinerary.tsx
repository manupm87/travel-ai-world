"use client";

import React, { useState } from "react";
import { Container } from "@/components/ui/Container";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { Trip } from "@/types/trip";
import { getFlag } from "@/utils/countryFlag";
import { useLanguage } from "@/context/LanguageContext";
import { DayCard } from "./DayCard";

interface ItineraryProps {
  trip: Trip;
}

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
    <section className="w-full bg-bg-secondary py-[60px]">
      <Container className="flex flex-col gap-8">
        {/* Destination Filters */}
        <div className="flex flex-wrap gap-3 mb-4">
          <button 
            onClick={() => setFilter("all")}
            aria-pressed={filter === "all"}
            className={`px-5 py-2.5 rounded-full text-[13px] font-semibold transition-colors ${
              filter === "all" ? "bg-accent text-white" : "bg-white/10 text-white/90 hover:bg-white/20"
            }`}
          >
            {t.tripViewer.allDays}
          </button>
          {trip.destinations.map(dest => (
            <button
              key={dest.id}
              onClick={() => setFilter(dest.id)}
              aria-pressed={filter === dest.id}
              className={`px-5 py-2.5 rounded-full text-[13px] font-semibold transition-colors flex items-center gap-2 ${
                filter === dest.id ? "bg-accent text-white" : "bg-white/10 text-white/90 hover:bg-white/20"
              }`}
            >
              <span className="font-normal" role="img" aria-label={dest.city}>{getDestinationFlag(dest.id)}</span>
              <span>{dest.city}</span>
            </button>
          ))}
        </div>

        <div className="flex flex-col gap-3">
          <SectionLabel>{t.tripViewer.yourItinerary}</SectionLabel>
          <h3 className="text-white text-[42px] font-bold tracking-[-1px] leading-[1.1]">
            {t.tripViewer.journeyTitle.replace("{duration}", trip.dates.durationDays.toString())}
          </h3>
        </div>

        <div className="flex flex-col gap-4 mt-4">
          {filteredItinerary.map(day => (
            <DayCard key={day.dayNumber} day={day} currency={trip.budget.currency} />
          ))}
        </div>
      </Container>
    </section>
  );
}
