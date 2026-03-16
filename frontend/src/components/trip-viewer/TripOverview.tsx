import React from "react";
import { Trip } from "@/types/trip";
import { Section } from "@/components/ui/Section";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { Card } from "@/components/ui/Card";
import { formatDate, formatDuration } from "@/utils/format";
import { useLanguage } from "@/context/LanguageContext";

interface TripOverviewProps {
  trip: Trip;
}


/**
 * Trip Logistics Overview (`trip-viewer`).
 * 
 * A split-pane section that displays the core logistical arrangements for the trip.
 * Currently renders two main `Card` blocks: Accommodations (hotels/stays) and
 * Transportation (flights/trains).
 * 
 * @param trip - The complete Trip data object.
 */
export default function TripOverview({ trip }: TripOverviewProps) {
  const { t, language } = useLanguage();

  return (
    <Section variant="secondary">
      <SectionLabel>{t.tripViewer.tripOverview}</SectionLabel>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Accommodations Card */}
          <Card className="flex flex-col gap-4">
            <div className="flex items-center gap-3 pb-3 border-b border-border-soft">
              <span role="img" aria-label="Hotel" className="text-2xl">🏨</span>
              <h3 className="text-text-primary text-lg font-medium">{t.tripViewer.accommodations}</h3>
            </div>
            
            <div className="flex flex-col gap-4">
              {trip.accommodation.map(acc => (
                <div key={acc.id} className="flex flex-col gap-1">
                  <div className="flex justify-between items-start">
                    <span className="text-text-primary font-medium">{acc.name}</span>
                    <span className="text-text-secondary text-sm">{acc.rating} ★</span>
                  </div>
                  <span className="text-text-secondary text-sm">{acc.city}, {acc.countryCode}</span>
                  <span className="text-text-secondary text-xs">
                    {formatDate(acc.checkIn, language === "en" ? "en-US" : "es-ES", { month: "short", day: "numeric" })} - {formatDate(acc.checkOut, language === "en" ? "en-US" : "es-ES", { month: "short", day: "numeric" })}
                  </span>
                </div>
              ))}
            </div>
          </Card>

          {/* Transportation Card */}
          <Card className="flex flex-col gap-4">
            <div className="flex items-center gap-3 pb-3 border-b border-border-soft">
              <span role="img" aria-label="Plane" className="text-2xl">✈️</span>
              <h3 className="text-text-primary text-lg font-medium">{t.tripViewer.transportation}</h3>
            </div>
            
            <div className="flex flex-col gap-4">
              {trip.transportation.map(trans => (
                <div key={trans.id} className="flex flex-col gap-1">
                  <div className="flex justify-between items-start">
                    <span className="text-text-primary font-medium">{trans.fromCity} → {trans.toCity}</span>
                    <span className="bg-bg-secondary text-text-secondary border border-border-soft text-[10px] px-2 py-0.5 rounded capitalize">{trans.type}</span>
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
    </Section>
  );
}
