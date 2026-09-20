"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { interpolate } from "@/i18n";
import { isApiAvailable, UnauthorizedError } from "@/services/http";
import { readSavedTripId, writeSavedTripId } from "@/services/plannerDraft";
import { clearSession } from "@/services/session";
import { saveDraftAsTrip } from "@/services/trips";
import { daysBetween } from "@/utils/tripDates";
import { hasItinerary, type ItineraryDraft, type PlannerState } from "./plannerReducer";

export type SaveTripStatus = "idle" | "saving" | "saved" | "error";

export interface UseSaveTripOptions {
  /**
   * False while the recorded session is answering (`usePlanner`'s `demo`): a
   * demo trip belongs to nobody and must not reach anyone's account.
   */
  enabled?: boolean;
}

export interface UseSaveTripResult {
  status: SaveTripStatus;
  /** The trip this tab's draft is saved as, or `null` until it is saved once. */
  tripId: string | null;
  /** Whether "Save trip" does anything: something to save, and somewhere to save it. */
  canSave: boolean;
  /** Writes the draft. Safe to call again after a failure, or after a change. */
  save: () => void;
}

/**
 * "Save trip": the planner's draft written to core_api as one trip.
 *
 * The write itself is `services/trips.ts::saveDraftAsTrip`; the hook owns the
 * state the button renders (`idle | saving | saved | error`), the title — the
 * one string here, so it is in the reader's language — and the id of the trip
 * the draft was saved as, kept with the draft in `services/plannerDraft.ts`.
 * That id is what makes the second click an update: the same trip is
 * rewritten, and planning for an hour leaves one trip, not twelve.
 *
 * Editing the itinerary after a save puts the button back to `idle`, because
 * what is in the account is no longer what is on screen. Keeping the two in
 * step without asking is TRA-146.
 */
export function useSaveTrip(
  state: PlannerState,
  { enabled = true }: UseSaveTripOptions = {}
): UseSaveTripResult {
  const { t } = useLanguage();
  const { isAuthenticated } = useAuth();
  const [status, setStatus] = useState<SaveTripStatus>("idle");
  // The id belongs to the tab, not to this mount: a reload in the middle of
  // planning must still update the trip it already wrote.
  const [tripId, setTripId] = useState<string | null>(() => readSavedTripId());

  const controllerRef = useRef<AbortController | null>(null);
  useEffect(() => () => controllerRef.current?.abort(), []);

  const { brief, itinerary } = state;

  // What was last written, so an itinerary that has moved on since puts the
  // button back to work. Adjusted while rendering rather than in an effect:
  // "Saved" must not be on screen for a frame under a trip it no longer
  // describes.
  const [savedItinerary, setSavedItinerary] = useState<ItineraryDraft | null>(null);
  if (status === "saved" && savedItinerary !== itinerary) setStatus("idle");

  const canSave = enabled && isAuthenticated && isApiAvailable() && hasItinerary(itinerary);

  const save = useCallback(() => {
    if (!canSave || status === "saving") return;
    const p = t.plan.panel;
    const count = daysBetween(brief.start_date, brief.end_date) ?? itinerary.days.length;
    const title = brief.destination
      ? interpolate(p.heading, { count, destination: brief.destination })
      : p.headingNoDestination;

    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setStatus("saving");

    saveDraftAsTrip(itinerary, brief, { title, tripId, signal: controller.signal })
      .then((trip) => {
        if (controller.signal.aborted) return;
        writeSavedTripId(trip.id);
        setTripId(trip.id);
        setSavedItinerary(itinerary);
        setStatus("saved");
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        // The API rejected our token: the route guard takes it from here, and
        // there is nothing useful to say about a page that is going away.
        if (err instanceof UnauthorizedError) {
          clearSession();
          return;
        }
        setStatus("error");
      });
  }, [brief, canSave, itinerary, status, t, tripId]);

  return { status, tripId, canSave, save };
}
