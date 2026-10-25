"use client";

/** Today's token counters, for the access list. */

import { useCallback, useEffect, useState } from "react";
import { getAdminUsage, type AdminUsage } from "@/services/admin";
import { isAbortError } from "@/services/http";
import { toAdminError, type AdminError } from "./adminErrors";

export type AdminUsageState =
  | { status: "loading" }
  | { status: "ready"; usage: AdminUsage }
  | { status: "error"; error: AdminError };

/**
 * Every account's token counter of today (UTC), from ai_api. `reload()` keeps the rows on screen
 * while it asks again (`reloading`), so the table does not flash.
 */
export function useAdminUsage() {
  const [state, setState] = useState<AdminUsageState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [loaded, setLoaded] = useState(-1);

  useEffect(() => {
    const controller = new AbortController();
    getAdminUsage(undefined, { signal: controller.signal })
      .then((usage) => {
        if (controller.signal.aborted) return;
        setState({ status: "ready", usage });
        setLoaded(attempt);
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted || isAbortError(err)) return;
        const error = toAdminError(err);
        if (error) setState({ status: "error", error });
        setLoaded(attempt);
      });
    return () => controller.abort();
  }, [attempt]);

  const reload = useCallback(() => setAttempt((n) => n + 1), []);

  return { ...state, reloading: loaded !== attempt, reload } as AdminUsageState & {
    reloading: boolean;
    reload: () => void;
  };
}
