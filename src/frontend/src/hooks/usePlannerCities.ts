"use client";

import { useEffect, useState } from "react";
import { listCities } from "@/services/planner";
import type { PlannerCity } from "@/types/planner";

export type PlannerCitiesStatus = "loading" | "ready" | "error";

/** Accent-folded and lowercased, the way `ai_api`'s `resolve_city` compares. */
function fold(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

/** `needle` as a whole word inside `haystack`; both already folded. */
function containsWord(haystack: string, needle: string): boolean {
  if (!needle) return false;
  const isBoundary = (char: string) => char === "" || /[^a-z0-9]/.test(char);
  for (let from = 0; from <= haystack.length; ) {
    const at = haystack.indexOf(needle, from);
    if (at === -1) return false;
    const before = at === 0 ? "" : (haystack[at - 1] ?? "");
    const after = haystack[at + needle.length] ?? "";
    if (isBoundary(before) && isBoundary(after)) return true;
    from = at + 1;
  }
  return false;
}

/**
 * The covered city a destination names, or `null` when the list has none —
 * which is what demo mode, a static build and any city outside the manifest
 * all look like.
 *
 * It has to be as forgiving as the backend that produced the text:
 * `ai_api`'s `resolve_city` matches a whole alias *inside* the destination
 * after folding accents, and it never rewrites `brief.destination`, so the
 * brief legitimately holds "Budapest, Hungary", "Trip to Budapest" or
 * "budapest ". So: fold both sides, then look for the slug or the name as a
 * whole word in the destination, preferring a city the destination names
 * exactly when several match.
 *
 * The backend's other aliases ("Bolonia" for Bologna, …) are not on
 * `PlannerCity` yet, so a destination that uses one still resolves to `null`
 * here; publishing them is a follow-up.
 */
export function findCity(
  cities: PlannerCity[],
  destination: string | null | undefined
): PlannerCity | null {
  const wanted = fold(destination ?? "");
  if (!wanted) return null;

  const keysOf = (city: PlannerCity) => [fold(city.slug), fold(city.name)];

  return (
    cities.find((city) => keysOf(city).includes(wanted)) ??
    cities.find((city) => keysOf(city).some((key) => containsWord(wanted, key))) ??
    null
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
