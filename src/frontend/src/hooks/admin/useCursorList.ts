"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { isAbort, toAdminError, type AdminError } from "./adminErrors";

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
 * A list read page by page through an opaque cursor, the shape every admin
 * list shares (`{ items, next_cursor }`).
 *
 * `key` names the query: when it changes the list starts over. `loadMore()`
 * appends the next page; with `all` the hook keeps reading until the last
 * page, which is what the users join needs. Requests are aborted on a new
 * key and on unmount; a 401 clears the session, a 403 is `"forbidden"`.
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
            if (controller.signal.aborted || isAbort(err)) return;
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

  return {
    items: state.items,
    status: state.status,
    error: state.error,
    loadingMore: state.loadingMore,
    hasMore: state.cursor !== null,
    loadMore,
    reload,
  };
}
