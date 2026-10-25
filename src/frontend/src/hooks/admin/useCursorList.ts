"use client";

/** A cursor-paged list, read a page at a time. */

import { useCallback, useEffect, useRef, useState } from "react";
import { isAbortError } from "@/services/http";
import { toAdminError, type AdminError } from "./adminErrors";

export interface CursorPage<T> {
  items: T[];
  next_cursor: string | null;
}

export interface CursorListResult<T> {
  items: T[];
  status: "loading" | "ready" | "error";
  error: AdminError | null;
  /** True while the page after the ones shown is on its way. */
  loadingMore: boolean;
  hasMore: boolean;
  loadMore: () => void;
  reload: () => void;
  /**
   * Reads the list again from its first page while the rows on screen stay, for after a write;
   * `reload` starts over behind the loader instead.
   */
  refresh: () => void;
}

interface ListState<T> {
  key: string;
  items: T[];
  cursor: string | null;
  status: "loading" | "ready" | "error";
  error: AdminError | null;
  loadingMore: boolean;
}

const initial = <T,>(key: string): ListState<T> => ({
  key,
  items: [],
  cursor: null,
  status: "loading",
  error: null,
  loadingMore: false,
});

/**
 * A list read page by page through an opaque cursor (`{ items, next_cursor }`). A new `key`
 * starts over; with `all` the hook reads every page, which the users join needs.
 */
export function useCursorList<T>(
  key: string,
  fetchPage: (cursor: string | null, signal: AbortSignal) => Promise<CursorPage<T>>,
  { all = false }: { all?: boolean } = {}
): CursorListResult<T> {
  const [attempt, setAttempt] = useState(0);
  const fullKey = `${key}#${attempt}`;
  const [state, setState] = useState<ListState<T>>(() => initial<T>(fullKey));
  const fetchRef = useRef(fetchPage);
  const controllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    fetchRef.current = fetchPage;
  });

  if (state.key !== fullKey) setState(initial<T>(fullKey));

  const read = useCallback(
    (cursor: string | null, pageKey: string) => {
      controllerRef.current?.abort();
      const controller = new AbortController();
      controllerRef.current = controller;

      const step = (from: string | null): void => {
        fetchRef
          .current(from, controller.signal)
          .then((page) => {
            if (controller.signal.aborted) return;
            setState((current) =>
              current.key !== pageKey
                ? current
                : {
                    ...current,
                    items: from === null ? page.items : [...current.items, ...page.items],
                    cursor: page.next_cursor,
                    status: "ready",
                    error: null,
                    loadingMore: all && page.next_cursor !== null,
                  }
            );
            if (all && page.next_cursor) step(page.next_cursor);
          })
          .catch((err: unknown) => {
            if (controller.signal.aborted || isAbortError(err)) return;
            const error = toAdminError(err);
            if (!error) return;
            setState((current) =>
              current.key !== pageKey
                ? current
                : { ...current, status: current.items.length ? "ready" : "error", error, loadingMore: false }
            );
          });
      };
      step(cursor);
    },
    [all]
  );

  useEffect(() => {
    read(null, fullKey);
    return () => controllerRef.current?.abort();
  }, [fullKey, read]);

  const loadMore = useCallback(() => {
    if (state.loadingMore || state.cursor === null || state.status !== "ready") return;
    setState((current) => ({ ...current, loadingMore: true }));
    read(state.cursor, state.key);
  }, [read, state.cursor, state.key, state.loadingMore, state.status]);

  const reload = useCallback(() => setAttempt((n) => n + 1), []);

  const refresh = useCallback(() => read(null, fullKey), [read, fullKey]);

  return {
    items: state.items,
    status: state.status,
    error: state.error,
    loadingMore: state.loadingMore,
    hasMore: state.cursor !== null,
    loadMore,
    reload,
    refresh,
  };
}
