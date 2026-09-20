"use client";

import { useEffect, useState } from "react";
import { listCities } from "@/services/planner";
import type { PlannerCity } from "@/types/planner";

export type PlannerCitiesStatus = "loading" | "ready" | "error";

/**
 * The covered city a destination names, or `null` when the list has none —
 * which is what demo mode, a static build and any city outside the manifest
 * all look like. Matched on the slug or the name `ai_api` publishes, ignoring
 * case and surrounding space, exactly as the map's centre has always been.
 */
export function findCity(
  cities: PlannerCity[],
  destination: string | null | undefined
): PlannerCity | null {
  const wanted = destination?.trim().toLowerCase();
  if (!wanted) return null;
  return (
    cities.find(
      (candidate) =>
        candidate.slug.toLowerCase() === wanted || candidate.name.toLowerCase() === wanted
    ) ?? null
  );
}

export interface UsePlannerCitiesResult {
  /** The cities the planner can plan; empty until `status` is `"ready"`, and
   *  when the service is not configured or the call failed (the page then
   *  falls back to its built-in copy). */
  cities: PlannerCity[];
  status: PlannerCitiesStatus;
}

/**
 * The destinations the planner offers (`GET /ai/planner/cities`), loaded once
 * on mount. A failure is not an error the page shows: the chips and the
 * placeholder simply keep their default copy, so the planner never blocks on
 * this call.
 */
export function usePlannerCities(): UsePlannerCitiesResult {
  const [result, setResult] = useState<UsePlannerCitiesResult>({
    cities: [],
    status: "loading",
  });

  useEffect(() => {
    let cancelled = false;
    listCities()
      .then((cities) => {
        if (!cancelled) setResult({ cities, status: "ready" });
      })
      .catch(() => {
        if (!cancelled) setResult({ cities: [], status: "error" });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return result;
}
