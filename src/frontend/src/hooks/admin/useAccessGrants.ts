"use client";

import { useCallback } from "react";
import {
  deleteAccessGrant,
  listAccessGrants,
  putAccessGrant,
  type AccessGrant,
  type AccessGrantWrite,
} from "@/services/admin";
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
 * (it is a short list), plus the two writes. A write that succeeds reloads
 * the list, so the table always shows what core_api stored; one that fails
 * rejects with an `AccessWriteError` (`forbidden` or `failed`). A 401 clears
 * the session like every admin read does, and the page goes away.
 */
export function useAccessGrants() {
  const fetchPage = useCallback(
    (cursor: string | null, signal: AbortSignal) => listAccessGrants(cursor, { signal }),
    []
  );
  const list = useCursorList<AccessGrant>("access", fetchPage, { all: true });
  const { reload } = list;

  const save = useCallback(
    async (email: string, grant: AccessGrantWrite): Promise<AccessGrant> => {
      try {
        const saved = await putAccessGrant(email, grant);
        reload();
        return saved;
      } catch (err) {
        throw new AccessWriteError(toAdminError(err) ?? "failed");
      }
    },
    [reload]
  );

  const remove = useCallback(
    async (email: string): Promise<void> => {
      try {
        await deleteAccessGrant(email);
      } catch (err) {
        throw new AccessWriteError(toAdminError(err) ?? "failed");
      }
      reload();
    },
    [reload]
  );

  return { ...list, save, remove };
}
