"use client";

/** The cities the planner covers, and which one a destination names. */

import { useEffect, useState } from "react";
import { isAbortError, UnauthorizedError } from "@/services/http";
import { listCities } from "@/services/planner";
import { clearSession } from "@/services/session";
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
 * The covered city a destination names, or `null`. As forgiving as ai_api's `resolve_city`,
 * which leaves "Trip to Budapest" in the brief: the slug or name as a whole folded word, an exact
 * match first. ai_api's other aliases ("Bolonia") are not on `PlannerCity`, so they give `null`.
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
  /** The cities the planner can plan; empty until `"ready"`, without ai_api, or after a failure. */
  cities: PlannerCity[];
  status: PlannerCitiesStatus;
}

/**
 * The destinations the planner offers (`GET /ai/planner/cities`), loaded once on mount.
 * A failure shows nothing: the chips and the placeholder keep their default copy. A 401 also
 * clears the session; unmounting aborts the request.
 */
export function usePlannerCities(): UsePlannerCitiesResult {
  const [result, setResult] = useState<UsePlannerCitiesResult>({
    cities: [],
    status: "loading",
  });

  useEffect(() => {
    const controller = new AbortController();
    listCities({ signal: controller.signal })
      .then((cities) => {
        if (!controller.signal.aborted) setResult({ cities, status: "ready" });
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted || isAbortError(err)) return;
        if (err instanceof UnauthorizedError) clearSession();
        setResult({ cities: [], status: "error" });
      });
    return () => controller.abort();
  }, []);

  return result;
}
