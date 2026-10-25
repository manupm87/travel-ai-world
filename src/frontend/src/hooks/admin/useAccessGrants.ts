"use client";

/** The access list: its grants and their writes. */

import { useCallback } from "react";
import {
  deleteAccessGrant,
  listAccessGrants,
  putAccessGrant,
  type AccessGrant,
  type AccessGrantWrite,
} from "@/services/admin";
import { ApiError } from "@/services/http";
import { toAdminError, type AdminError } from "./adminErrors";
import { useCursorList } from "./useCursorList";

/** A write the console could not make, as the page says it. */
export class AccessWriteError extends Error {
  constructor(readonly reason: AdminError) {
    super(reason);
    this.name = "AccessWriteError";
  }
}

/**
 * The whole access list plus its two writes. A successful write refreshes the list behind the
 * rows on screen; a failed one rejects with an `AccessWriteError`. Removing an email that is
 * already gone (404) is a success.
 */
export function useAccessGrants() {
  const fetchPage = useCallback(
    (cursor: string | null, signal: AbortSignal) => listAccessGrants(cursor, { signal }),
    []
  );
  const list = useCursorList<AccessGrant>("access", fetchPage, { all: true });
  const { refresh } = list;

  const save = useCallback(
    async (email: string, grant: AccessGrantWrite): Promise<AccessGrant> => {
      try {
        const saved = await putAccessGrant(email, grant);
        refresh();
        return saved;
      } catch (err) {
        throw new AccessWriteError(toAdminError(err) ?? "failed");
      }
    },
    [refresh]
  );

  const remove = useCallback(
    async (email: string): Promise<void> => {
      try {
        await deleteAccessGrant(email);
      } catch (err) {
        const gone = err instanceof ApiError && err.status === 404;
        if (!gone) throw new AccessWriteError(toAdminError(err) ?? "failed");
      }
      refresh();
    },
    [refresh]
  );

  return { ...list, save, remove };
}
