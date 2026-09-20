"use client";

import { useState, type Dispatch, type SetStateAction } from "react";
import type { ItineraryDraft } from "./plannerReducer";

/**
 * Which day of the itinerary the planner is showing, or `null` for the trip
 * overview — the whole trip across the two right columns (TRA-177), which is
 * where an itinerary always opens. It belongs to the page
 * (`PlannerClientPage`) because both the panel — `DayStrip` and what it shows
 * below, the overview or one day — and the map slot follow it; it is not
 * persisted, a reload starts again on the overview.
 *
 * One rule covers both cases the planner has: when the day list changes and no
 * longer holds the selected day, the selection goes back to the overview — not
 * to the first day. That is what makes a new trip open on the overview ("Start
 * over" empties the itinerary first, so the selection is already back on it
 * when the new days arrive) and what catches a regenerated, shorter trip. Days
 * are never removed one by one (`applyItineraryOp` only adds and replaces), so
 * nothing else can strand the selection.
 *
 * The adjustment happens while rendering, not in an effect: React re-runs this
 * component before touching the DOM, so the panel and the map never paint the
 * day that has just disappeared (https://react.dev/reference/react/useState#storing-information-from-previous-renders).
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
