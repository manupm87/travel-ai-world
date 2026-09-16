"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { ApiError, UnauthorizedError } from "@/services/http";
import { clearSession } from "@/services/session";
import { listTrips } from "@/services/trips";
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
 * The dashboard's trips, loaded in the browser with the session token.
 *
 * - Fetches on mount once the session is known (`isAuthenticated`), and again
 *   on `reload()`; every request is aborted when the component unmounts or a
 *   newer request starts, so a stale answer never lands in state.
 * - A 401 means the API rejected our token: the session is cleared and the
 *   route guard (`(app)/layout.tsx`) sends the visitor home. The hook stays in
 *   `"loading"` meanwhile; nothing to render, the page is going away.
 * - Every other failure ends in `"error"` with the `ApiError` for the UI to
 *   translate (never the server's text).
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

  return {
    trips: state.status === "ready" ? state.trips : [],
    status: state.status,
    error: state.status === "error" ? state.error : null,
    reload,
  };
}
