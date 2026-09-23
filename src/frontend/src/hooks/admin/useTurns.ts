"use client";

import { useCallback } from "react";
import { listTurns, type TurnQuery, type TurnSummary } from "@/services/admin";
import { useCursorList } from "./useCursorList";

/**
 * The turns that match `query`, a page at a time: `items` accumulates,
 * `loadMore()` reads the next page while `hasMore`. A new query starts over.
 */
export function useTurns(query: TurnQuery) {
  const key = JSON.stringify(query);
  const fetchPage = useCallback(
    (cursor: string | null, signal: AbortSignal) => listTurns(query, cursor, { signal }),
    // The key is the query, compared by value.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key]
  );
  return useCursorList<TurnSummary>(key, fetchPage);
}
