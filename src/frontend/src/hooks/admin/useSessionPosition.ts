"use client";

/** A turn's position in its planner session. */

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
 * Where `turnId` sits among the turns of `sessionId`, for the inspector's previous / next.
 * `null` while loading, without a session, and on any failure: never a reason to fail the page.
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
