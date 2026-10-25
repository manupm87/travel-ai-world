"use client";

/** Saves the planner's draft as a trip. */

import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { interpolate } from "@/i18n";
import { isApiAvailable, UnauthorizedError } from "@/services/http";
import { readSavedTripId, writeSavedTripId } from "@/services/plannerDraft";
import { clearSession } from "@/services/session";
import { saveDraftAsTrip } from "@/services/trips";
import type { PlannerCity } from "@/types/planner";
import { daysBetween, todayIso } from "@/utils/tripDates";
import { hasItinerary, type ItineraryDraft, type PlannerState } from "./plannerReducer";

export type SaveTripStatus = "idle" | "saving" | "saved" | "error";

export interface UseSaveTripOptions {
  /**
   * False while the recorded session is answering (`usePlanner`'s `demo`): a
   * demo trip belongs to nobody and must not reach anyone's account.
   */
  enabled?: boolean;
  /**
   * The destination as ai_api publishes it: a trip is one city, written from its slug, country
   * and centre, so without one there is nothing valid to save.
   */
  city?: PlannerCity | null;
  /**
   * The trip open in the planner (`/plan/?trip=`), which Save updates instead
   * of creating a second one. `null` falls back to whatever this tab last
   * saved, so a reload in the middle of planning still updates that trip.
   */
  openTripId?: string | null;
}

export interface UseSaveTripResult {
  status: SaveTripStatus;
  /** The trip this tab's draft is saved as, or `null` until it is saved once. */
  tripId: string | null;
  /** Whether "Save trip" does anything: something to save, and somewhere to save it. */
  canSave: boolean;
  /**
   * Why a trip that could otherwise be saved cannot: its dates start today or earlier,
   * and core_api locks such a trip (ADR 0019).
   */
  blocked: "past-dates" | null;
  /** Writes the draft. Safe to call again after a failure, or after a change. */
  save: () => void;
}

/**
 * "Save trip": the planner's draft written to core_api as one trip (`saveDraftAsTrip`).
 * The tab keeps the saved trip's id, so every later press rewrites that trip instead of adding
 * one; editing the itinerary after a save puts the button back to `idle`.
 */
export function useSaveTrip(
  state: PlannerState,
  { enabled = true, city = null, openTripId = null }: UseSaveTripOptions = {}
): UseSaveTripResult {
  const { t } = useLanguage();
  const { isAuthenticated } = useAuth();
  const [status, setStatus] = useState<SaveTripStatus>("idle");
  // the id belongs to the tab, not to this mount: a reload must still update the same trip
  const [tripId, setTripId] = useState<string | null>(() => openTripId ?? readSavedTripId());

  // another trip opened, or none: adjusted while rendering so Save never targets one off screen
  const [opened, setOpened] = useState<string | null>(openTripId);
  if (opened !== openTripId) {
    setOpened(openTripId);
    const next = openTripId ?? readSavedTripId();
    if (next !== tripId) {
      setTripId(next);
      setStatus("idle");
    }
  }

  const controllerRef = useRef<AbortController | null>(null);
  useEffect(() => () => controllerRef.current?.abort(), []);

  const { brief, itinerary } = state;

  // adjusted while rendering: "Saved" must not show for a frame under an itinerary that moved on
  const [savedItinerary, setSavedItinerary] = useState<ItineraryDraft | null>(null);
  if (status === "saved" && savedItinerary !== itinerary) setStatus("idle");

  // core_api would store a trip that has started, then refuse every day written into it
  const pastDates = brief.start_date !== null && brief.start_date <= todayIso();
  const blocked = pastDates ? ("past-dates" as const) : null;

  const canSave =
    enabled &&
    isAuthenticated &&
    isApiAvailable() &&
    city !== null &&
    hasItinerary(itinerary) &&
    !pastDates;

  const save = useCallback(() => {
    if (!canSave || !city || status === "saving") return;
    const p = t.plan.panel;
    const count = daysBetween(brief.start_date, brief.end_date) ?? itinerary.days.length;
    const title = brief.destination
      ? interpolate(p.heading, { count, destination: brief.destination })
      : p.headingNoDestination;

    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setStatus("saving");

    saveDraftAsTrip(itinerary, brief, city, {
      title,
      tripId,
      signal: controller.signal,
      // kept at once, so a later failure is retried as an update of this trip
      onCreated: (id) => {
        if (controller.signal.aborted) return;
        writeSavedTripId(id);
        setTripId(id);
      },
    })
      .then((trip) => {
        if (controller.signal.aborted) return;
        writeSavedTripId(trip.id);
        setTripId(trip.id);
        setSavedItinerary(itinerary);
        setStatus("saved");
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        // the route guard takes a rejected token from here; the page is going away
        if (err instanceof UnauthorizedError) {
          clearSession();
          return;
        }
        setStatus("error");
      });
  }, [brief, canSave, city, itinerary, status, t, tripId]);

  return { status, tripId, canSave, blocked, save };
}
