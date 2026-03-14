"use client";

import React, { useState } from "react";
import { Container } from "@/components/ui/Container";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { Card } from "@/components/ui/Card";
import { Trip } from "@/types/trip";
import { getFlag } from "@/utils/countryFlag";
import { formatDate } from "@/utils/format";
import { useLanguage } from "@/context/LanguageContext";
import { Navigation } from "lucide-react";

interface InteractiveTimelineProps {
  trip: Trip;
}


/**
 * Interactive Route Timeline (`trip-viewer`).
 * 
 * Renders a visual "subway map" style timeline of the trip's destinations.
 * Users can click on a specific destination node to shift the active state,
 * which dynamically updates the "Active Destination Info Panel" below it.
 * 
 * @param trip - The complete Trip data object.
 */
export default function InteractiveTimeline({ trip }: InteractiveTimelineProps) {
  const { t, language } = useLanguage();
  const [activeDest, setActiveDest] = useState<string>(trip.destinations[0]?.id || "");

  const activeDestData = trip.destinations.find(d => d.id === activeDest);

  return (
    <section className="w-full bg-transparent pb-10">
      <Container className="flex flex-col gap-6">
        <div className="flex justify-between items-end">
          <div className="flex flex-col gap-4">
            <SectionLabel>{t.tripViewer.journeyMap}</SectionLabel>
            <h2 className="text-white text-3xl font-medium tracking-tight">
              {t.tripViewer.routeOverview}
            </h2>
          </div>
        </div>
        
        <Card className="p-6 md:p-10 flex flex-col gap-10 relative overflow-hidden rounded-[24px] border-border-soft bg-bg-card/40 backdrop-blur-sm">
          {/* Timeline Visualizer */}
          <div className="flex flex-col md:flex-row items-center justify-between w-full relative z-10 gap-12 md:gap-4 py-4">
            
            {/* Horizontal Line (Desktop) */}
            <div className="hidden md:block absolute top-[28px] left-[5%] right-[5%] h-[2px] bg-white/10 -z-10">
              <div 
                className="h-full bg-accent transition-all duration-500 shadow-[0_0_10px_rgba(79,110,247,0.5)]"
                style={{ width: `${(trip.destinations.findIndex(d => d.id === activeDest) / (trip.destinations.length - 1)) * 100}%` }}
              ></div>
            </div>
            
            {trip.destinations.map((dest, i) => {
              const isActive = activeDest === dest.id;
              return (
                <div key={dest.id} className="flex flex-col items-center gap-4 relative w-full md:w-auto">
                  {/* Interactive Dot */}
                  <button 
                    onClick={() => setActiveDest(dest.id)}
                    className={`w-14 h-14 rounded-full border-4 transition-all duration-300 flex items-center justify-center z-10 ${
                      isActive 
                        ? "bg-accent border-accent/40 scale-110 shadow-[0_0_20px_rgba(79,110,247,0.4)]" 
                        : "bg-bg-primary border-white/5 hover:border-white/20"
                    }`}
                  >
                    <span className="text-2xl" role="img" aria-label={dest.city}>
                      {getFlag(dest.countryCode)}
                    </span>
                  </button>
                  
                  <div className="flex flex-col items-center gap-0.5">
                    <span className={`font-medium transition-colors ${isActive ? "text-white" : "text-text-secondary"}`}>
                      {dest.city}
                    </span>
                    <span className="text-text-secondary text-[11px] uppercase tracking-wider font-medium">
                      {dest.nightsStaying} {t.tripViewer.nights}
                    </span>
                  </div>
                  
                  {/* Vertical Line (Mobile) */}
                  {i < trip.destinations.length - 1 && (
                    <div className="md:hidden absolute top-[56px] h-12 w-[2px] bg-white/10 -z-10"></div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Active Destination Info Panel */}
          {activeDestData && (
            <div className="mt-4 p-6 rounded-2xl bg-white/5 border border-white/5 animate-in fade-in slide-in-from-top-2 duration-300">
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                <div className="flex items-start gap-4">
                  <div className="p-3 rounded-xl bg-accent/20 text-accent">
                    <Navigation size={24} />
                  </div>
                  <div className="flex flex-col">
                    <h4 className="text-white text-xl font-medium">{activeDestData.city}</h4>
                    <p className="text-text-secondary text-sm">
                      {formatDate(activeDestData.arrivalDate, language === "en" ? "en-US" : "es-ES", { month: "long", day: "numeric" })} - {formatDate(activeDestData.departureDate, language === "en" ? "en-US" : "es-ES", { month: "long", day: "numeric" })}
                    </p>
                  </div>
                </div>
                
                <div className="flex gap-3">
                  <div className="px-4 py-2 rounded-lg bg-white/5 border border-white/5 flex flex-col">
                    <span className="text-[10px] text-text-secondary uppercase tracking-widest font-medium mb-1">{t.tripViewer.nights}</span>
                    <span className="text-white font-medium">{activeDestData.nightsStaying}</span>
                  </div>
                  <button 
                    onClick={() => {
                      const el = document.getElementById(`dest-${activeDestData.id}`);
                      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }}
                    className="px-6 py-2 rounded-lg bg-accent hover:bg-accent-hover text-white text-sm font-medium transition-all shadow-lg shadow-accent/20 cursor-pointer"
                  >
                    {t.tripViewer.viewItinerary || "View Itinerary"}
                  </button>
                </div>
              </div>
            </div>
          )}
        </Card>
      </Container>
    </section>
  );
}
