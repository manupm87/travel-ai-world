import React from "react";
import { BedDouble, Plane } from "lucide-react";
import { Trip } from "@/types/trip";
import { Section } from "@/components/ui/Section";
import { Card } from "@/components/ui/Card";
import { useFormatters } from "@/hooks/useFormatters";
import { useLanguage } from "@/context/LanguageContext";

interface TripOverviewProps {
  trip: Trip;
}

/**
 * Trip logistics overview (`trip-viewer`).
 *
 * The two arrangements a trip stands on — where you sleep and how you move —
 * side by side on glass, over the aurora rather than on an opaque band
 * (TRA-193).
 *
 * @param trip - The complete Trip data object.
 */
export default function TripOverview({ trip }: TripOverviewProps) {
  const { t } = useLanguage();
  const { formatDate, formatDuration } = useFormatters();

  return (
    <Section variant="transparent" padding="medium">
      <h2 className="mb-5 text-2xl font-light text-text-primary">
        {t.tripViewer.tripOverview}
      </h2>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card variant="glass" className="flex flex-col gap-4">
          <div className="flex items-center gap-3 border-b border-glass-border pb-3">
            <BedDouble size={20} aria-hidden="true" className="text-accent" />
            <h3 className="text-lg font-medium text-text-primary">
              {t.tripViewer.accommodations}
            </h3>
          </div>

          <div className="flex flex-col gap-4">
            {trip.accommodation.map((acc) => (
              <div key={acc.id} className="flex flex-col gap-1">
                <div className="flex items-start justify-between gap-3">
                  <span className="font-medium text-text-primary">{acc.name}</span>
                  <span className="shrink-0 text-sm text-text-secondary">{acc.rating} ★</span>
                </div>
                <span className="text-sm text-text-secondary">
                  {acc.city}, {acc.countryCode}
                </span>
                <span className="text-xs text-text-secondary">
                  {formatDate(acc.checkIn, { month: "short", day: "numeric" })} –{" "}
                  {formatDate(acc.checkOut, { month: "short", day: "numeric" })}
                </span>
              </div>
            ))}
          </div>
        </Card>

        <Card variant="glass" className="flex flex-col gap-4">
          <div className="flex items-center gap-3 border-b border-glass-border pb-3">
            <Plane size={20} aria-hidden="true" className="text-accent" />
            <h3 className="text-lg font-medium text-text-primary">
              {t.tripViewer.transportation}
            </h3>
          </div>

          <div className="flex flex-col gap-4">
            {trip.transportation.map((trans) => (
              <div key={trans.id} className="flex flex-col gap-1">
                <div className="flex items-start justify-between gap-3">
                  {/* The arrow is the direction of travel, not decoration. */}
                  <span className="font-medium text-text-primary">
                    {trans.fromCity} → {trans.toCity}
                  </span>
                  <span className="shrink-0 rounded border border-glass-border bg-glass-bg px-2 py-0.5 text-[11px] text-text-secondary capitalize">
                    {trans.type}
                  </span>
                </div>
                <span className="text-sm text-text-secondary">
                  {trans.provider} {trans.flightNumber && `· ${trans.flightNumber}`}
                </span>
                <span className="text-xs text-text-secondary">
                  {trans.departureTime} – {trans.arrivalTime} ({formatDuration(trans.duration)})
                </span>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </Section>
  );
}
