"use client";

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
 * The access list (TRA-257): every grant, all pages read one after another
 * (it is a short list), plus the two writes. A write that succeeds reads the
 * list again while the rows on screen stay (`refresh`), so the table always
 * ends up showing what core_api stored without flashing the loader; one that
 * fails rejects with an `AccessWriteError` (`forbidden` or `failed`). Removing
 * an email that is already gone (404: another administrator was faster) is a
 * success. A 401 clears the session like every admin read does, and the page
 * goes away.
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
