"use client";

/** One option card in full, cached per id. */

import { useEffect, useState } from "react";
import { isAbortError } from "@/services/http";
import { getCardDetail } from "@/services/planner";
import type { CardDetail } from "@/types/planner";

export type CardDetailStatus = "idle" | "loading" | "ready" | "unavailable" | "error";

export interface UseCardDetailResult {
  /** The full card, or `null` until (and unless) it arrives. */
  detail: CardDetail | null;
  status: CardDetailStatus;
}

/**
 * The service's answer per corpus id, for the life of the tab: an article does not change while
 * a trip is planned. `null` ("this id has no detail") is cached too.
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

/**
 * The full card behind one corpus id (`GET /ai/planner/card?id=`), for the activity panel.
 * `unavailable` (no backend, no route, unknown id) and `error` both show the card alone:
 * a missing detail is no reason to put an error in front of the traveller.
 */
export function useCardDetail(id: string | null): UseCardDetailResult {
  const [result, setResult] = useState<UseCardDetailResult>(
    () => cached(id) ?? { detail: null, status: "loading" }
  );
  // adjusted while rendering: the panel must never paint the previous activity's description
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
        if (controller.signal.aborted || isAbortError(err)) return;
        // not cached: a failed call is worth retrying next time
        setResult({ detail: null, status: "error" });
      });
    return () => controller.abort();
  }, [id]);

  return result;
}
