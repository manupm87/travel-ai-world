"use client";

import { useEffect, useState } from "react";
import { getTurn, type TurnDetail } from "@/services/admin";
import { isAbort, toAdminError, type AdminError } from "./adminErrors";

export type TurnState =
  | { status: "loading" }
  | { status: "ready"; turn: TurnDetail }
  | { status: "not-found" }
  | { status: "error"; error: AdminError };

/**
 * One turn, whole, for `/admin/turn/?id=` (TRA-222's placeholder; TRA-228's
 * inspector renders the same state). A missing id is not-found without a
 * request.
 */
export function useTurn(id: string | null): TurnState {
  const [state, setState] = useState<TurnState>({ status: "loading" });
  const [loadedId, setLoadedId] = useState(id);

  if (loadedId !== id) {
    setLoadedId(id);
    setState({ status: "loading" });
  }

  useEffect(() => {
    if (!id) return;
    const controller = new AbortController();
    getTurn(id, { signal: controller.signal })
      .then((turn) => {
        if (controller.signal.aborted) return;
        setState(turn ? { status: "ready", turn } : { status: "not-found" });
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted || isAbort(err)) return;
        const error = toAdminError(err);
        if (error) setState({ status: "error", error });
      });
    return () => controller.abort();
  }, [id]);

  return id ? state : { status: "not-found" };
}
