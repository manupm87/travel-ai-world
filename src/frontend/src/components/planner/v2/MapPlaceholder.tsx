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
  /** Its position in the day, or `null` for the stay, which has no slot. */
  number: number | null;
}

export interface MapPlaceholderProps {
  itinerary: ItineraryDraft;
  /** Only this day is mapped: its stops, in slot order, plus the stay. */
  selectedDay: number;
}

/**
 * Stands in for the real map (TRA-147): a decorative panel plus the selected
 * day's stops that already have coordinates, numbered in slot order — exactly
 * the list the map issue turns into pins, so it replaces this file and nothing
 * else in the panel.
 */
export function MapPlaceholder({ itinerary, selectedDay }: MapPlaceholderProps) {
  const { t } = useLanguage();
  const p = t.plan.panel;

  const day = itinerary.days.find((d) => d.day === selectedDay) ?? itinerary.days[0] ?? null;

  const stops: Stop[] = [];
  if (itinerary.stay && itinerary.stay.lat !== null && itinerary.stay.lon !== null) {
    stops.push({
      id: `stay:${itinerary.stay.id}`,
      label: `${p.stayNoNights} · ${itinerary.stay.title}`,
      number: null,
    });
  }
  if (day) {
    let number = 0;
    for (const part of DAY_PARTS) {
      for (const card of day.slots[part]) {
        if (card.lat === null || card.lon === null) continue;
        number += 1;
        stops.push({ id: `${day.day}:${part}:${card.id}`, label: card.title, number });
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
        <ul
          aria-label={interpolate(p.stopsOfDay, { day: day ? day.day : selectedDay })}
          className="flex flex-col gap-1"
        >
          {stops.map((stop) => (
            <li key={stop.id} className="flex items-center gap-1.5 text-xs text-text-secondary">
              {stop.number === null ? (
                <MapPin size={11} aria-hidden="true" className="shrink-0 text-accent" />
              ) : (
                <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-accent-soft text-[10px] font-medium text-text-primary">
                  {stop.number}
                </span>
              )}
              <span>{stop.label}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
