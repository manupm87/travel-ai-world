"use client";

/** The LLM judge's runs: one started from the page, streamed, and the stored history. */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  listAnswerEvals,
  streamAnswerEval,
  type EvalItem,
  type EvalRun,
  type EvalSet,
} from "@/services/admin";
import { ApiError, isAbortError } from "@/services/http";
import { toAdminError, type AdminError } from "./adminErrors";

/** What a run can fail with: an admin error, another run in progress, or a stop mid-stream. */
export type AnswerEvalError =
  | { kind: AdminError }
  | { kind: "busy" }
  | { kind: "stopped"; message: string }
  | { kind: "cut" };

export interface AnswerEvalState {
  /** The set being run; `null` when nothing runs. */
  running: EvalSet | null;
  /** When the run in progress started, in epoch milliseconds. */
  startedAt: number;
  done: number;
  total: number;
  /** The items of the run in progress, newest first. */
  items: EvalItem[];
  /** The run that just finished, as stored. */
  finished: EvalRun | null;
  error: AnswerEvalError | null;
}

const IDLE: AnswerEvalState = {
  running: null,
  startedAt: 0,
  done: 0,
  total: 0,
  items: [],
  finished: null,
  error: null,
};

/**
 * Starts a run and follows its stream. Nothing runs until `run()`: a run spends model tokens.
 * Leaving the page aborts the stream and ai_api stops the run, so the browser asks first.
 * `onRunsChanged` is called once the run is stored and again when it ends, so the history can
 * reload. While it runs, leaving the page asks first: `leaveMessage` is the question.
 */
export function useAnswerEval(onRunsChanged?: () => void, leaveMessage = "") {
  const [state, setState] = useState<AnswerEvalState>(IDLE);
  const inFlight = useRef<AbortController | null>(null);
  const finishedRef = useRef(onRunsChanged);

  useEffect(() => {
    finishedRef.current = onRunsChanged;
  });
  useEffect(() => () => inFlight.current?.abort(), []);

  const running = state.running !== null;
  useEffect(() => {
    if (!running) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    // in-app links navigate without `beforeunload`: ask before the click reaches the router
    const confirmLeave = (event: MouseEvent) => {
      const link = (event.target as Element | null)?.closest?.("a[href]");
      if (!link || event.defaultPrevented || window.confirm(leaveMessage)) return;
      event.preventDefault();
      event.stopPropagation();
    };
    window.addEventListener("beforeunload", warn);
    document.addEventListener("click", confirmLeave, true);
    return () => {
      window.removeEventListener("beforeunload", warn);
      document.removeEventListener("click", confirmLeave, true);
    };
  }, [running, leaveMessage]);

  const run = useCallback(async (set: EvalSet) => {
    if (inFlight.current) return;
    const controller = new AbortController();
    inFlight.current = controller;
    setState({ ...IDLE, running: set, startedAt: Date.now() });
    let ended = false;
    try {
      for await (const event of streamAnswerEval(set, { signal: controller.signal })) {
        if (event.type !== "progress") ended = true;
        else if (event.done === 1) finishedRef.current?.(); // the run is stored before its first event
        if (event.type === "progress") {
          setState((s) => ({
            ...s,
            done: event.done,
            total: event.total,
            items: [event.item, ...s.items],
          }));
        } else if (event.type === "report") {
          setState((s) => ({ ...s, finished: event.run }));
        } else {
          setState((s) => ({ ...s, error: { kind: "stopped", message: event.error } }));
        }
      }
      // a body that ends with neither a report nor an error was cut on the way
      if (!ended && !controller.signal.aborted) setState((s) => ({ ...s, error: { kind: "cut" } }));
    } catch (err: unknown) {
      if (controller.signal.aborted || isAbortError(err)) return;
      if (err instanceof ApiError && err.status === 409) {
        setState((s) => ({ ...s, error: { kind: "busy" } }));
      } else {
        const error = toAdminError(err);
        if (error) setState((s) => ({ ...s, error: { kind: error } }));
      }
    } finally {
      if (inFlight.current === controller) inFlight.current = null;
      if (!controller.signal.aborted) {
        setState((s) => ({ ...s, running: null }));
        finishedRef.current?.();
      }
    }
  }, []);

  return { ...state, run };
}

export type RunsState =
  | { status: "loading" }
  | { status: "ready"; runs: EvalRun[] }
  | { status: "error"; error: AdminError };

/** The latest stored runs, newest first; `reload()` asks again and keeps the list meanwhile. */
export function useAnswerEvalRuns() {
  const [state, setState] = useState<RunsState>({ status: "loading" });
  const [version, setVersion] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    listAnswerEvals({ signal: controller.signal })
      .then((page) => {
        if (!controller.signal.aborted) setState({ status: "ready", runs: page.items });
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted || isAbortError(err)) return;
        const error = toAdminError(err);
        if (error) setState({ status: "error", error });
      });
    return () => controller.abort();
  }, [version]);

  const reload = useCallback(() => setVersion((v) => v + 1), []);
  return { state, reload };
}
