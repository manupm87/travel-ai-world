"use client";

import { useCallback } from "react";
import { listAdminTrips, type AdminTripSummary } from "@/services/admin";
import { useCursorList } from "./useCursorList";

/** Every saved trip, newest first, a page at a time (`loadMore()` while `hasMore`). */
export function useAdminTrips() {
  const fetchPage = useCallback(
    (cursor: string | null, signal: AbortSignal) => listAdminTrips(cursor, { signal }),
    []
  );
  return useCursorList<AdminTripSummary>("trips", fetchPage);
}
