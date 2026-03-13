import React from "react";
import { Destination } from "@/types/trip";
import { formatDate } from "@/utils/format";
import { getFlag } from "@/utils/countryFlag";
import { Container } from "@/components/ui/Container";

interface DestinationTimelineProps {
  destinations: Destination[];
}

export default function DestinationTimeline({ destinations }: DestinationTimelineProps) {
  return (
    <section className="w-full bg-bg-secondary pb-10">
      <Container className="flex flex-col gap-5">
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
                <span className="text-2xl">{getFlag(dest.countryCode)}</span>
              </div>
              
              <div className="flex flex-col gap-1 mt-auto pt-2 text-sm text-text-secondary">
                <div>
                  {formatDate(dest.arrivalDate, "en-US", { month: "short", day: "numeric" })} - {formatDate(dest.departureDate, "en-US", { month: "short", day: "numeric" })}
                </div>
                <div>{dest.nightsStaying} Nights</div>
              </div>
            </div>
          ))}
        </div>
      </Container>
    </section>
  );
}
