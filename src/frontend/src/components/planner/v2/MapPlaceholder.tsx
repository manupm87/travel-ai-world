"use client";

import { MapPin } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { useLanguage } from "@/context/LanguageContext";
import { interpolate } from "@/i18n";
import type { ItineraryDraft } from "@/hooks/plannerReducer";
import { DAY_PARTS } from "@/types/planner";

interface Stop {
  id: string;
  label: string;
}

/**
 * Stands in for the real map (TRA-147): a decorative panel plus the stops the
 * itinerary already has coordinates for, so the map issue replaces this file
 * and nothing else in the panel.
 */
export function MapPlaceholder({ itinerary }: { itinerary: ItineraryDraft }) {
  const { t } = useLanguage();
  const p = t.plan.panel;

  const stops: Stop[] = [];
  if (itinerary.stay && itinerary.stay.lat !== null && itinerary.stay.lon !== null) {
    stops.push({ id: `stay:${itinerary.stay.id}`, label: `${p.stayNoNights} · ${itinerary.stay.title}` });
  }
  for (const day of itinerary.days) {
    for (const part of DAY_PARTS) {
      for (const card of day.slots[part]) {
        if (card.lat === null || card.lon === null) continue;
        stops.push({
          id: `${day.day}:${part}:${card.id}`,
          label: `${interpolate(p.day, { day: day.day })} · ${card.title}`,
        });
      }
    }
  }

  return (
    <Card className="flex flex-col gap-3 p-4">
      <h3 className="text-sm font-medium text-text-primary">{p.mapTitle}</h3>
      <div
        aria-hidden="true"
        className="h-28 w-full rounded-xl bg-gradient-to-br from-accent/25 via-purple/15 to-bg-surface"
      />
      <p className="text-xs leading-snug text-text-secondary">{p.mapPlaceholder}</p>
      {stops.length > 0 && (
        <ul className="flex flex-col gap-1">
          {stops.map((stop) => (
            <li key={stop.id} className="flex items-center gap-1.5 text-xs text-text-secondary">
              <MapPin size={11} aria-hidden="true" className="shrink-0 text-accent" />
              <span>{stop.label}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
