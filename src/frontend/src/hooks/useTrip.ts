"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { ApiError, UnauthorizedError } from "@/services/http";
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
 * One trip, loaded in the browser with the session token (the `useTrips`
 * pattern, for the viewer at `/trip/?id=<uuid>`).
 *
 * - A missing or malformed `id` is `"not-found"` at once, without a request.
 * - Otherwise it fetches on mount once the session is known
 *   (`isAuthenticated`), again when `id` changes and on `reload()`; every
 *   request is aborted when the component unmounts or a newer one starts, so
 *   a stale answer never lands in state. The result is remembered together
 *   with the id it belongs to: a new id starts from `"loading"` again.
 * - `getTrip` resolves `null` for a 404 and for a 403 (someone else's trip):
 *   both are `"not-found"`, the same page, nothing leaked.
 * - A 401 means the API rejected our token: the session is cleared and the
 *   route guard (`(app)/layout.tsx`) sends the visitor home. The hook stays in
 *   `"loading"` meanwhile; nothing to render, the page is going away.
 * - Every other failure ends in `"error"` with the `ApiError` for the UI to
 *   translate (never the server's text).
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
        if (controller.signal.aborted || isAbort(err)) return;
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

  // What was loaded for another id is not this trip: derive, never carry over.
  const state: TripState = !valid ? NOT_FOUND : loaded?.forId === id ? loaded.state : LOADING;

  return {
    trip: state.status === "ready" ? state.trip : null,
    status: state.status,
    error: state.status === "error" ? state.error : null,
    reload,
  };
}
