"use client";

import { useCallback, useEffect, useState } from "react";
import { isTripId } from "@/hooks/useTrip";
import { getAdminTrip, type AdminTrip } from "@/services/admin";
import { tripToDraft, type TripDraft } from "@/services/tripDraft";
import { toTrip } from "@/services/trips";
import type { Trip } from "@/types/trip";
import { isAbort, toAdminError, type AdminError } from "./adminErrors";

/**
 * What the trip page renders: the response as core_api sent it (the owner and
 * the planner session live only there), the `Trip` view model and the
 * planner's draft rebuilt from it — the same `toTrip → tripToDraft` path the
 * planner takes when it reopens a trip, so both screens show the same trip.
 */
export interface AdminTripData {
  dto: AdminTrip;
  trip: Trip;
  draft: TripDraft["draft"];
}

export type AdminTripState =
  | { status: "loading" }
  | { status: "ready"; data: AdminTripData }
  | { status: "not-found" }
  | { status: "error"; error: AdminError };

const LOADING: AdminTripState = { status: "loading" };
const NOT_FOUND: AdminTripState = { status: "not-found" };

/**
 * Anyone's trip, read only, for `/admin/trip/?user=&id=` (TRA-229).
 *
 * A missing user or a malformed trip id is `"not-found"` without a request.
 * The request is aborted on unmount and whenever the ids change; a 404 is
 * `"not-found"`, a 403 `"forbidden"`, a 401 clears the session (the route
 * guard then sends the visitor home). Nothing here writes.
 */
export function useAdminTrip(
  userId: string | null,
  tripId: string | null
): AdminTripState & { reload: () => void } {
  const valid = Boolean(userId) && isTripId(tripId);
  const key = `${userId ?? ""}/${tripId ?? ""}`;
  const [attempt, setAttempt] = useState(0);
  const [loaded, setLoaded] = useState<{
    key: string;
    attempt: number;
    state: AdminTripState;
  } | null>(null);

  useEffect(() => {
    if (!valid || !userId || !tripId) return;
    const controller = new AbortController();
    getAdminTrip(userId, tripId, { signal: controller.signal })
      .then((dto) => {
        if (controller.signal.aborted) return;
        if (!dto) {
          setLoaded({ key, attempt, state: NOT_FOUND });
          return;
        }
        const trip = toTrip(dto);
        setLoaded({
          key,
          attempt,
          state: { status: "ready", data: { dto, trip, draft: tripToDraft(trip).draft } },
        });
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted || isAbort(err)) return;
        const error = toAdminError(err);
        if (error) setLoaded({ key, attempt, state: { status: "error", error } });
      });
    return () => controller.abort();
  }, [valid, userId, tripId, key, attempt]);

  const reload = useCallback(() => setAttempt((n) => n + 1), []);

  // What was loaded for other ids, or before a retry, is not this answer.
  const state: AdminTripState = !valid
    ? NOT_FOUND
    : loaded?.key === key && loaded.attempt === attempt
      ? loaded.state
      : LOADING;

  return { ...state, reload };
}
