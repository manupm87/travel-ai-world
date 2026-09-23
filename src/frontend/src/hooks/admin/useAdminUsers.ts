"use client";

import { useCallback, useMemo } from "react";
import { listAdminUsers, type AdminUser } from "@/services/admin";
import { useCursorList } from "./useCursorList";

/**
 * Every account, all pages read one after another (the console is for a
 * handful of people and joins on them everywhere). `byId` answers a trip's
 * owner, `bySubject` a turn's user: the traces carry the token subject, never
 * the email (ADR 0024).
 */
export function useAdminUsers() {
  const fetchPage = useCallback(
    (cursor: string | null, signal: AbortSignal) => listAdminUsers(cursor, { signal }),
    []
  );
  const list = useCursorList<AdminUser>("users", fetchPage, { all: true });

  const { byId, bySubject } = useMemo(() => {
    const ids = new Map<string, AdminUser>();
    const subjects = new Map<string, AdminUser>();
    for (const user of list.items) {
      ids.set(user.id, user);
      if (user.subject) subjects.set(user.subject, user);
    }
    return { byId: ids, bySubject: subjects };
  }, [list.items]);

  return { ...list, byId, bySubject };
}

/** How an account is named in a table: its name, else its email. */
export function displayName(user: AdminUser | undefined): string | null {
  if (!user) return null;
  return user.name?.trim() || user.email;
}
