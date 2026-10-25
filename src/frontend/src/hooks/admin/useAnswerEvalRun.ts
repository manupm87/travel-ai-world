"use client";

/** One stored run of the LLM judge, for its detail page. */

import { useEffect, useState } from "react";
import { getAnswerEval, type EvalRunDetail } from "@/services/admin";
import { isAbortError } from "@/services/http";
import { toAdminError, type AdminError } from "./adminErrors";

export type EvalRunState =
  | { status: "loading" }
  | { status: "ready"; detail: EvalRunDetail }
  | { status: "not-found" }
  | { status: "error"; error: AdminError };

/** One run with its items, for `/admin/judge/run/?id=`. A missing id is not-found without a request. */
export function useAnswerEvalRun(id: string | null): EvalRunState {
  const [state, setState] = useState<EvalRunState>({ status: "loading" });
  const [loadedId, setLoadedId] = useState(id);

  if (loadedId !== id) {
    setLoadedId(id);
    setState({ status: "loading" });
  }

  useEffect(() => {
    if (!id) return;
    const controller = new AbortController();
    getAnswerEval(id, { signal: controller.signal })
      .then((detail) => {
        if (controller.signal.aborted) return;
        setState(detail ? { status: "ready", detail } : { status: "not-found" });
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted || isAbortError(err)) return;
        const error = toAdminError(err);
        if (error) setState({ status: "error", error });
      });
    return () => controller.abort();
  }, [id]);

  return id ? state : { status: "not-found" };
}
