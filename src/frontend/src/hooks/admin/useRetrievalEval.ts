"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { runRetrievalEval, type RetrievalEval } from "@/services/admin";
import { isAbort, toAdminError, type AdminError } from "./adminErrors";

export interface RetrievalEvalState {
  /** The last run that finished, kept on screen while the next one runs. */
  result: RetrievalEval | null;
  running: boolean;
  /** Why the last run failed; cleared when the next one starts. */
  error: AdminError | null;
}

/**
 * The retrieval evaluation (TRA-273). Nothing runs until `run()`: a run is a
 * hundred searches against the deployed index, not a read to do on every
 * visit. A run in flight is aborted when a newer one starts or the page
 * unmounts.
 */
export function useRetrievalEval() {
  const [state, setState] = useState<RetrievalEvalState>({
    result: null,
    running: false,
    error: null,
  });
  const inFlight = useRef<AbortController | null>(null);

  useEffect(() => () => inFlight.current?.abort(), []);

  const run = useCallback(() => {
    inFlight.current?.abort();
    const controller = new AbortController();
    inFlight.current = controller;
    setState((s) => ({ ...s, running: true, error: null }));
    runRetrievalEval({ signal: controller.signal })
      .then((result) => {
        if (controller.signal.aborted) return;
        setState({ result, running: false, error: null });
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted || isAbort(err)) return;
        const error = toAdminError(err);
        setState((s) => ({ ...s, running: false, error: error ?? s.error }));
      });
  }, []);

  return { ...state, run };
}
