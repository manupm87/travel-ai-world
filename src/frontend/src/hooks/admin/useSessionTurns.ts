"use client";

import { useEffect, useState } from "react";
import { listSessionTurns, type TurnSummary } from "@/services/admin";
import { isAbort } from "./adminErrors";

/** Where a turn sits in its planner session: 0-based `index`, and its neighbours' ids. */
export interface SessionPosition {
  turns: TurnSummary[];
  index: number;
  prev: string | null;
  next: string | null;
}

/** Pages read at most: a session longer than this shows the turns it has. */
const MAX_PAGES = 5;

/**
 * The turns of `sessionId`, oldest first, and where `turnId` sits among them
 * (TRA-228: the inspector's previous / next). `null` while loading, when the
 * turn has no session, when the turn is not in the list, and on any failure —
 * the position is a convenience, never a reason to fail the page.
 */
export function useSessionTurns(sessionId: string | null, turnId: string | null): SessionPosition | null {
  const [loaded, setLoaded] = useState<{ key: string; turns: TurnSummary[] } | null>(null);
  const key = sessionId ?? "";

  useEffect(() => {
    if (!sessionId) return;
    const controller = new AbortController();
    (async () => {
      const turns: TurnSummary[] = [];
      let cursor: string | null = null;
      for (let page = 0; page < MAX_PAGES; page++) {
        const result = await listSessionTurns(sessionId, cursor, { signal: controller.signal });
        turns.push(...result.items);
        cursor = result.next_cursor;
        if (!cursor) break;
      }
      if (!controller.signal.aborted) setLoaded({ key: sessionId, turns });
    })().catch((err: unknown) => {
      if (controller.signal.aborted || isAbort(err)) return;
      setLoaded({ key: sessionId, turns: [] });
    });
    return () => controller.abort();
  }, [sessionId]);

  if (!sessionId || !turnId || !loaded || loaded.key !== key) return null;
  const { turns } = loaded;
  const index = turns.findIndex((turn) => turn.turn_id === turnId);
  if (index < 0) return null;
  return {
    turns,
    index,
    prev: turns[index - 1]?.turn_id ?? null,
    next: turns[index + 1]?.turn_id ?? null,
  };
}
