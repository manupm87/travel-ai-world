"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { ApiError, UnauthorizedError } from "@/services/http";
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
   * Rejects with the failure so the dialog that asked can say so.
   */
  remove: (id: string) => Promise<void>;
  /**
   * Gives a trip another title and replaces its card with what the API
   * stored. Rejects on a refusal — core_api answers 409 `TRIP_LOCKED` for a
   * trip that is no longer upcoming — so the dialog that asked can say so.
   */
  rename: (id: string, title: string) => Promise<void>;
}

type TripsState =
  | { status: "loading" }
  | { status: "ready"; trips: TripSummary[] }
  | { status: "error"; error: ApiError };

const LOADING: TripsState = { status: "loading" };

/** Whether a rejection is the abort we asked for (jsdom and browsers agree on the name). */
function isAbort(err: unknown): boolean {
  return err instanceof Error && err.name === "AbortError";
}

/**
 * Anything that is not already an `ApiError` (a network failure surfaces as a
 * `TypeError` from `fetch`) becomes one with status 0, so the UI has a single
 * error type to render.
 */
function toApiError(err: unknown): ApiError {
  if (err instanceof ApiError) return err;
  return new ApiError(0, err instanceof Error ? err.message : String(err));
}

/**
 * The account's trips, loaded in the browser with the session token and
 * listed by the planner (TRA-196).
 *
 * - Fetches on mount once the session is known (`isAuthenticated`), and again
 *   on `reload()`; every request is aborted when the component unmounts or a
 *   newer request starts, so a stale answer never lands in state.
 * - A 401 means the API rejected our token: the session is cleared and the
 *   route guard (`(app)/layout.tsx`) sends the visitor home. The hook stays in
 *   `"loading"` meanwhile; nothing to render, the page is going away.
 * - Every other failure ends in `"error"` with the `ApiError` for the UI to
 *   translate (never the server's text).
 * - `remove(id)` and `rename(id, title)` are the list's own writes: the list
 *   is patched in place instead of reloaded, so deleting one card does not
 *   blank the rest. Both reject on failure — the dialog that asked decides
 *   what to say — and `remove` puts the card back first.
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
        if (controller.signal.aborted || isAbort(err)) return;
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
      // Optimistic: deleting is what the visitor asked for, so the card leaves
      // before the round trip and comes back only if the API says no.
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
    },
    [withTrips]
  );

  const rename = useCallback(
    async (id: string, title: string) => {
      // Not optimistic: the API is the one that normalises what was typed,
      // and it is also the one that may refuse the write outright.
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
