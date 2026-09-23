"use client";

import { useCallback, useEffect, useState } from "react";
import { getStats, type TraceStats } from "@/services/admin";
import { isAbort, toAdminError, type AdminError } from "./adminErrors";

export type AdminStatsState =
  | { status: "loading" }
  | { status: "ready"; stats: TraceStats }
  | { status: "error"; error: AdminError };

/** The `YYYY-MM-DD` of a date, in UTC (the traces are partitioned by UTC day). */
export function utcDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** The `[start, end]` UTC days of the last `days` days, today included. */
export function rangeFor(days: number, now: Date = new Date()): { start: string; end: string } {
  const start = new Date(now.getTime() - (days - 1) * 24 * 60 * 60 * 1000);
  return { start: utcDay(start), end: utcDay(now) };
}

/**
 * The stats of `[start, end]`, loaded again whenever the range changes or
 * `reload()` is called; the request in flight is aborted when a newer one
 * starts or the component unmounts.
 */
export function useAdminStats(start: string, end: string) {
  const [state, setState] = useState<AdminStatsState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const key = `${start}|${end}|${attempt}`;
  const [loadedKey, setLoadedKey] = useState(key);

  // A new range goes back through "loading" while rendering, not in the effect.
  if (loadedKey !== key) {
    setLoadedKey(key);
    setState({ status: "loading" });
  }

  useEffect(() => {
    const controller = new AbortController();
    getStats(start, end, { signal: controller.signal })
      .then((stats) => {
        if (!controller.signal.aborted) setState({ status: "ready", stats });
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted || isAbort(err)) return;
        const error = toAdminError(err);
        if (error) setState({ status: "error", error });
      });
    return () => controller.abort();
  }, [start, end, attempt]);

  const reload = useCallback(() => setAttempt((n) => n + 1), []);

  return { ...state, reload } as AdminStatsState & { reload: () => void };
}
