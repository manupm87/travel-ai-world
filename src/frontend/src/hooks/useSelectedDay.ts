"use client";

import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { hasItinerary, type ItineraryDraft } from "./plannerReducer";

/**
 * Which day of the itinerary the planner is showing. It belongs to the page
 * (`PlannerClientPage`) because both the panel — `DayStrip` and the day it
 * expands — and the map slot follow it; it is not persisted, a reload starts
 * again on the first day.
 *
 * It resets to the first day when an itinerary appears, and falls back to it
 * when the day list shrinks under the selection (a regenerated, shorter trip).
 */
export function useSelectedDay(
  itinerary: ItineraryDraft
): [number, Dispatch<SetStateAction<number>>] {
  const days = itinerary.days;
  const firstDay = days[0]?.day ?? 1;
  const ready = hasItinerary(itinerary);

  const [selectedDay, setSelectedDay] = useState(firstDay);
  const wasReady = useRef(ready);

  useEffect(() => {
    const appeared = ready && !wasReady.current;
    wasReady.current = ready;
    setSelectedDay((current) =>
      appeared || !days.some((d) => d.day === current) ? firstDay : current
    );
  }, [ready, days, firstDay]);

  return [selectedDay, setSelectedDay];
}
