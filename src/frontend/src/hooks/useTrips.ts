"use client";

/** The account's trips, for the trips home. */

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { type ApiError, isAbortError, toApiError, UnauthorizedError } from "@/services/http";
import { clearPlannerDraft, readSavedTripId } from "@/services/plannerDraft";
import { clearSession } from "@/services/session";
import { deleteTrip, listTrips, toTripSummary, updateTrip } from "@/services/trips";
import type { TripSummary } from "@/types/trip-summary";

export type TripsStatus = "loading" | "ready" | "error";

export interface UseTripsResult {
  /** The signed-in user's trips; empty until `status` is `"ready"`. */
  trips: TripSummary[];
  status: TripsStatus;
  /** Why the last load failed (`status === "error"`); `null` otherwise. */
  error: ApiError | null;
  /** Asks the API again, going through `"loading"` first. */
  reload: () => void;
  /**
   * Deletes a trip: the card goes at once and comes back if the API refuses.
   * Rejects with the failure so the dialog that asked can say so. Deleting
   * the trip this tab's planner draft was saved as drops that draft too.
   */
  remove: (id: string) => Promise<void>;
  /**
   * Gives a trip another title and replaces its card with what the API stored. Rejects on a
   * refusal (409 `TRIP_LOCKED` for a trip that has started), so the dialog that asked can say so.
   */
  rename: (id: string, title: string) => Promise<void>;
}

type TripsState =
  | { status: "loading" }
  | { status: "ready"; trips: TripSummary[] }
  | { status: "error"; error: ApiError };

const LOADING: TripsState = { status: "loading" };

/**
 * The account's trips for the trips home, `/dashboard/` (ADR 0020). A 401 clears the session and
 * stays `"loading"` while the route guard sends the visitor home. `remove` and `rename` patch the
 * list in place instead of reloading it.
 */
export function useTrips(): UseTripsResult {
  const { isAuthenticated } = useAuth();
  const [state, setState] = useState<TripsState>(LOADING);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!isAuthenticated) return;
    const controller = new AbortController();

    listTrips({ signal: controller.signal })
      .then((trips) => {
        if (!controller.signal.aborted) setState({ status: "ready", trips });
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted || isAbortError(err)) return;
        if (err instanceof UnauthorizedError) {
          clearSession();
          return;
        }
        setState({ status: "error", error: toApiError(err) });
      });

    return () => controller.abort();
  }, [isAuthenticated, attempt]);

  const reload = useCallback(() => {
    setState(LOADING);
    setAttempt((n) => n + 1);
  }, []);

  /** Replaces the list, but only while there is one to replace. */
  const withTrips = useCallback((next: (trips: TripSummary[]) => TripSummary[]) => {
    setState((current) =>
      current.status === "ready" ? { status: "ready", trips: next(current.trips) } : current
    );
  }, []);

  const remove = useCallback(
    async (id: string) => {
      // optimistic: the card leaves at once and comes back only if the API says no
      let removed: TripSummary[] = [];
      withTrips((trips) => {
        removed = trips;
        return trips.filter((trip) => trip.id !== id);
      });
      try {
        await deleteTrip(id);
      } catch (err) {
        withTrips(() => removed);
        throw err;
      }
      // the tab's draft was saved as this trip, so the next `/plan/` must not restore it
      if (readSavedTripId() === id) clearPlannerDraft();
    },
    [withTrips]
  );

  const rename = useCallback(
    async (id: string, title: string) => {
      // not optimistic: the API normalises the title and may refuse the write
      const saved = toTripSummary(await updateTrip(id, { title }));
      withTrips((trips) => trips.map((trip) => (trip.id === id ? saved : trip)));
    },
    [withTrips]
  );

  return {
    trips: state.status === "ready" ? state.trips : [],
    status: state.status,
    error: state.status === "error" ? state.error : null,
    reload,
    remove,
    rename,
  };
}
