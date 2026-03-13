import React from "react";
import { Trip } from "@/types/trip";
import { Container } from "@/components/ui/Container";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { Card } from "@/components/ui/Card";
import { formatDate, formatDuration } from "@/utils/format";

interface TripOverviewProps {
  trip: Trip;
}

export default function TripOverview({ trip }: TripOverviewProps) {
  return (
    <section className="w-full bg-bg-secondary pb-10">
      <Container className="flex flex-col gap-5">
        <SectionLabel>Trip Overview</SectionLabel>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Accommodations Card */}
          <Card className="flex flex-col gap-4">
            <div className="flex items-center gap-3 pb-3 border-b border-border-soft">
              <span className="text-2xl">🏨</span>
              <h3 className="text-white text-lg font-bold">Accommodations</h3>
            </div>
            
            <div className="flex flex-col gap-4">
              {trip.accommodation.map(acc => (
                <div key={acc.id} className="flex flex-col gap-1">
                  <div className="flex justify-between items-start">
                    <span className="text-white font-semibold">{acc.name}</span>
                    <span className="text-white/80 text-sm">{acc.rating} ★</span>
                  </div>
                  <span className="text-text-secondary text-sm">{acc.city}, {acc.countryCode}</span>
                  <span className="text-text-secondary text-xs">
                    {formatDate(acc.checkIn, "en-US", { month: "short", day: "numeric" })} - {formatDate(acc.checkOut, "en-US", { month: "short", day: "numeric" })}
                  </span>
                </div>
              ))}
            </div>
          </Card>

          {/* Transportation Card */}
          <Card className="flex flex-col gap-4">
            <div className="flex items-center gap-3 pb-3 border-b border-border-soft">
              <span className="text-2xl">✈️</span>
              <h3 className="text-white text-lg font-bold">Transportation</h3>
            </div>
            
            <div className="flex flex-col gap-4">
              {trip.transportation.map(trans => (
                <div key={trans.id} className="flex flex-col gap-1">
                  <div className="flex justify-between items-start">
                    <span className="text-white font-semibold">{trans.fromCity} → {trans.toCity}</span>
                    <span className="bg-white/10 text-white/90 text-[10px] px-2 py-0.5 rounded capitalize">{trans.type}</span>
                  </div>
                  <span className="text-text-secondary text-sm">{trans.provider} {trans.flightNumber && `• ${trans.flightNumber}`}</span>
                  <span className="text-text-secondary text-xs text-capitalize">
                    {trans.departureTime} - {trans.arrivalTime} ({formatDuration(trans.duration)})
                  </span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </Container>
    </section>
  );
}
