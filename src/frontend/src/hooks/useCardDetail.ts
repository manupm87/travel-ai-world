"use client";

import { useEffect, useState } from "react";
import { getCardDetail } from "@/services/planner";
import type { CardDetail } from "@/types/planner";

export type CardDetailStatus = "idle" | "loading" | "ready" | "unavailable" | "error";

export interface UseCardDetailResult {
  /** The full card, or `null` until (and unless) it arrives. */
  detail: CardDetail | null;
  status: CardDetailStatus;
}

/**
 * What the service answered, per corpus id, for as long as the tab lives:
 * an article does not change while a trip is being planned, so walking back
 * and forth between the itinerary and an activity must not ask again.
 * `null` is a cached answer too — "this id has no detail" — and is kept.
 */
const cache = new Map<string, CardDetail | null>();

/** Empties the session cache. For tests; nothing in the app calls it. */
export function clearCardDetailCache(): void {
  cache.clear();
}

function cached(id: string | null): UseCardDetailResult | null {
  if (id === null) return { detail: null, status: "idle" };
  if (!cache.has(id)) return null;
  const detail = cache.get(id) ?? null;
  return { detail, status: detail ? "ready" : "unavailable" };
}

/** An abort is our own doing, never a failure to report. */
function aborted(err: unknown): boolean {
  return err instanceof DOMException && err.name === "AbortError";
}

/**
 * The full card behind one corpus id (`GET /ai/planner/card?id=`), for the
 * activity detail panel. `null` while nothing is selected.
 *
 * Four outcomes, and the panel treats them differently: `loading` draws a
 * skeleton, `ready` adds the description and the contact details to what the
 * card already carries, `unavailable` (no backend, no route, unknown id —
 * demo mode's normal state) shows the card alone and says nothing, and
 * `error` does the same, because a detail that failed to load is no reason to
 * put an error in front of a traveller browsing their trip.
 *
 * Selecting another activity aborts the request in flight, so a slow answer
 * can never land on the card that replaced it.
 */
export function useCardDetail(id: string | null): UseCardDetailResult {
  const [result, setResult] = useState<UseCardDetailResult>(
    () => cached(id) ?? { detail: null, status: "loading" }
  );
  // The id the state describes. Adjusted while rendering, as
  // `PlannerClientPage` adjusts its selected pin: the panel must never paint
  // the previous activity's description under the new activity's title.
  const [seenId, setSeenId] = useState(id);
  if (seenId !== id) {
    setSeenId(id);
    setResult(cached(id) ?? { detail: null, status: "loading" });
  }

  useEffect(() => {
    if (id === null || cache.has(id)) return;
    const controller = new AbortController();
    getCardDetail(id, { signal: controller.signal })
      .then((detail) => {
        if (controller.signal.aborted) return;
        cache.set(id, detail);
        setResult({ detail, status: detail ? "ready" : "unavailable" });
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted || aborted(err)) return;
        // Not cached: a failed call is worth retrying the next time the
        // traveller opens the same activity.
        setResult({ detail: null, status: "error" });
      });
    return () => controller.abort();
  }, [id]);

  return result;
}
