"use client";

import { useState, type Dispatch, type SetStateAction } from "react";
import type { ItineraryDraft } from "./plannerReducer";

/**
 * Which day of the itinerary the planner is showing. It belongs to the page
 * (`PlannerClientPage`) because both the panel — `DayStrip` and the day it
 * expands — and the map slot follow it; it is not persisted, a reload starts
 * again on the first day.
 *
 * One rule covers both cases the planner has: when the day list changes and no
 * longer holds the selected day, the selection goes back to the first day. That
 * is what makes a new trip open on day 1 — "Start over" empties the itinerary
 * first, so the selection is already back on the first day when the new days
 * arrive — and what catches a regenerated, shorter trip. Days are never removed
 * one by one (`applyItineraryOp` only adds and replaces), so nothing else can
 * strand the selection.
 *
 * The adjustment happens while rendering, not in an effect: React re-runs this
 * component before touching the DOM, so the panel and the map never paint the
 * day that has just disappeared (https://react.dev/reference/react/useState#storing-information-from-previous-renders).
 */
export function useSelectedDay(
  itinerary: ItineraryDraft
): [number, Dispatch<SetStateAction<number>>] {
  const days = itinerary.days;
  const firstDay = days[0]?.day ?? 1;

  const [selectedDay, setSelectedDay] = useState(firstDay);
  const [knownDays, setKnownDays] = useState(days);

  if (knownDays !== days) {
    setKnownDays(days);
    if (!days.some((day) => day.day === selectedDay)) setSelectedDay(firstDay);
  }

  return [selectedDay, setSelectedDay];
}
