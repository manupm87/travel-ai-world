import React from "react";
import { Destination } from "@/types/trip";

interface DestinationTimelineProps {
  destinations: Destination[];
}

export default function DestinationTimeline({ destinations }: DestinationTimelineProps) {
  const formatDateRange = (start: string, end: string) => {
    const s = new Date(start).toLocaleDateString("en-US", { month: "short", day: "numeric" });
    const e = new Date(end).toLocaleDateString("en-US", { month: "short", day: "numeric" });
    return `${s} - ${e}`;
  };

  return (
    <section className="w-full bg-bg-secondary pb-10">
      <div className="max-w-[1440px] w-full mx-auto px-8 lg:px-16 flex flex-col gap-5">
        <h2 className="text-accent text-[10px] font-bold tracking-[2.5px] uppercase">
          Journey Map
        </h2>
        
        <div className="flex flex-col md:flex-row gap-4">
          {destinations.map((dest, i) => (
            <div 
              key={dest.id}
              className={`flex-1 rounded-2xl p-5 flex flex-col gap-3 ${
                i === 0 ? "bg-accent/20 border border-accent-border" : "bg-bg-card border border-border"
              }`}
            >
              <div className="flex justify-between items-start">
                <h3 className="text-white text-xl font-bold">{dest.city}</h3>
                <span className="text-2xl">{dest.countryCode === 'FR' ? '🇫🇷' : dest.countryCode === 'IT' ? '🇮🇹' : '🇪🇸'}</span>
              </div>
              
              <div className="flex flex-col gap-1 mt-auto pt-2 text-sm text-text-secondary">
                <div>{formatDateRange(dest.arrivalDate, dest.departureDate)}</div>
                <div>{dest.nightsStaying} Nights</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
