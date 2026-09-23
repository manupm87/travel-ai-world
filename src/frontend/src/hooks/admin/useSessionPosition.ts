"use client";

import { useMemo } from "react";
import type { TurnSummary } from "@/services/admin";
import { useSessionTurns } from "./useSessionTurns";

/** Where a turn sits in its planner session: 0-based `index`, and its neighbours' ids. */
export interface SessionPosition {
  turns: TurnSummary[];
  index: number;
  prev: string | null;
  next: string | null;
}

/**
 * Where `turnId` sits among the turns of `sessionId` (TRA-228: the inspector's
 * previous / next), read through `useSessionTurns`. `null` while loading, when
 * the turn has no session, when the turn is not in the list, and on any
 * failure — the position is a convenience, never a reason to fail the page.
 */
export function useSessionPosition(
  sessionId: string | null,
  turnId: string | null
): SessionPosition | null {
  const state = useSessionTurns(sessionId);
  return useMemo(() => {
    if (!turnId || state.status !== "ready") return null;
    const { turns } = state;
    const index = turns.findIndex((turn) => turn.turn_id === turnId);
    if (index < 0) return null;
    return {
      turns,
      index,
      prev: turns[index - 1]?.turn_id ?? null,
      next: turns[index + 1]?.turn_id ?? null,
    };
  }, [state, turnId]);
}
