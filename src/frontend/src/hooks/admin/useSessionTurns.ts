"use client";

import { useEffect, useState } from "react";
import { listSessionTurns, type TurnSummary } from "@/services/admin";
import { isAbort, toAdminError, type AdminError } from "./adminErrors";

/** A session is a conversation, not a log: past this many turns the page stops reading. */
export const SESSION_TURNS_LIMIT = 200;

export type SessionTurnsState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; turns: TurnSummary[]; truncated: boolean }
  | { status: "error"; error: AdminError };

const IDLE: SessionTurnsState = { status: "idle" };
const LOADING: SessionTurnsState = { status: "loading" };

/**
 * Every turn of one planner session, oldest first as the API answers them,
 * page after page through `next_cursor` up to `SESSION_TURNS_LIMIT`
 * (`truncated` says there were more). `null` is `"idle"`: a trip saved
 * before sessions were recorded has none to ask for. Aborted on unmount and
 * when the session changes.
 */
export function useSessionTurns(sessionId: string | null): SessionTurnsState {
  const [loaded, setLoaded] = useState<{ id: string; state: SessionTurnsState } | null>(null);

  useEffect(() => {
    if (!sessionId) return;
    const controller = new AbortController();
    const turns: TurnSummary[] = [];

    const step = (cursor: string | null): void => {
      listSessionTurns(sessionId, cursor, { signal: controller.signal })
        .then((page) => {
          if (controller.signal.aborted) return;
          turns.push(...page.items);
          if (page.next_cursor && turns.length < SESSION_TURNS_LIMIT) {
            step(page.next_cursor);
            return;
          }
          const truncated = turns.length > SESSION_TURNS_LIMIT || page.next_cursor !== null;
          setLoaded({
            id: sessionId,
            state: { status: "ready", turns: turns.slice(0, SESSION_TURNS_LIMIT), truncated },
          });
        })
        .catch((err: unknown) => {
          if (controller.signal.aborted || isAbort(err)) return;
          const error = toAdminError(err);
          if (error) setLoaded({ id: sessionId, state: { status: "error", error } });
        });
    };
    step(null);
    return () => controller.abort();
  }, [sessionId]);

  if (!sessionId) return IDLE;
  return loaded?.id === sessionId ? loaded.state : LOADING;
}
