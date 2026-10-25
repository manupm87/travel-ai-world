"use client";

/** The day the planner shows. */

import { useState, type Dispatch, type SetStateAction } from "react";
import type { ItineraryDraft } from "./plannerReducer";

/**
 * Which day the planner shows, or `null` for the whole-trip overview, where an itinerary opens.
 * When the day list loses the selected day the selection goes back to the overview, adjusted
 * while rendering so the panel and the map never paint a day that has just disappeared.
 */
export function useSelectedDay(
  itinerary: ItineraryDraft
): [number | null, Dispatch<SetStateAction<number | null>>] {
  const days = itinerary.days;

  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [knownDays, setKnownDays] = useState(days);

  if (knownDays !== days) {
    setKnownDays(days);
    if (selectedDay !== null && !days.some((day) => day.day === selectedDay)) {
      setSelectedDay(null);
    }
  }

  return [selectedDay, setSelectedDay];
}
