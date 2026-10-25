"use client";

/** One saved trip, for the planner to reopen. */

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { type ApiError, isAbortError, toApiError, UnauthorizedError } from "@/services/http";
import { clearSession } from "@/services/session";
import { getTrip } from "@/services/trips";
import type { Trip } from "@/types/trip";

export type TripStatus = "loading" | "ready" | "not-found" | "error";

export interface UseTripResult {
  /** The trip to render; `null` until `status` is `"ready"`. */
  trip: Trip | null;
  status: TripStatus;
  /** Why the last load failed (`status === "error"`); `null` otherwise. */
  error: ApiError | null;
  /** Asks the API again, going through `"loading"` first. */
  reload: () => void;
}

type TripState =
  | { status: "loading" }
  | { status: "ready"; trip: Trip }
  | { status: "not-found" }
  | { status: "error"; error: ApiError };

const LOADING: TripState = { status: "loading" };
const NOT_FOUND: TripState = { status: "not-found" };

/** Trip ids are the UUIDs core_api generates; anything else cannot be a trip. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Whether `id` is worth asking the API about (core_api would answer 422 otherwise). */
export function isTripId(id: string | null | undefined): id is string {
  return typeof id === "string" && UUID.test(id);
}

/**
 * One trip, so the planner can hydrate from `/plan/?trip=<uuid>`. A malformed id, a 404 and a 403
 * are all `"not-found"`, without a request for the first. A 401 clears the session and stays
 * `"loading"` while the route guard sends the visitor home.
 */
export function useTrip(id: string | null): UseTripResult {
  const { isAuthenticated } = useAuth();
  const [loaded, setLoaded] = useState<{ forId: string; state: TripState } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const valid = isTripId(id);

  useEffect(() => {
    if (!valid || !isAuthenticated) return;
    const controller = new AbortController();

    getTrip(id, { signal: controller.signal })
      .then((trip) => {
        if (controller.signal.aborted) return;
        setLoaded({ forId: id, state: trip ? { status: "ready", trip } : NOT_FOUND });
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted || isAbortError(err)) return;
        if (err instanceof UnauthorizedError) {
          clearSession();
          return;
        }
        setLoaded({ forId: id, state: { status: "error", error: toApiError(err) } });
      });

    return () => controller.abort();
  }, [id, valid, isAuthenticated, attempt]);

  const reload = useCallback(() => {
    setLoaded(null);
    setAttempt((n) => n + 1);
  }, []);

  // what was loaded for another id is not this trip: derive, never carry over
  const state: TripState = !valid ? NOT_FOUND : loaded?.forId === id ? loaded.state : LOADING;

  return {
    trip: state.status === "ready" ? state.trip : null,
    status: state.status,
    error: state.status === "error" ? state.error : null,
    reload,
  };
}
