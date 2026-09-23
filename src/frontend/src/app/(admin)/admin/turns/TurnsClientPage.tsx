"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useMemo } from "react";
import { AdminHeading, AdminLoadState, LoadMore } from "@/components/admin/AdminStates";
import {
  parseTurnFilters,
  TurnFilters,
  turnFiltersQuery,
  type TurnFilterValues,
} from "@/components/admin/turns/TurnFilters";
import { TurnsTable } from "@/components/admin/turns/TurnsTable";
import { useLanguage } from "@/context/LanguageContext";
import { useAdminUsers } from "@/hooks/admin/useAdminUsers";
import { utcDay } from "@/hooks/admin/useAdminStats";
import { useTurns } from "@/hooks/admin/useTurns";
import type { TurnQuery } from "@/services/admin";

/**
 * The turns explorer: a day's turns (today, UTC, by default) narrowed by kind,
 * status, user and city. The filters live in the URL, so a link is a view;
 * the user list is the admin users join, by token subject.
 */
export default function TurnsClientPage() {
  const { t } = useLanguage();
  const router = useRouter();
  const params = useSearchParams();
  const today = useMemo(() => utcDay(new Date()), []);
  const filters = parseTurnFilters(new URLSearchParams(params.toString()), today);
  const { day, kind, status, subject, city } = filters;

  const query = useMemo<TurnQuery>(
    () => ({
      day,
      kind: kind || undefined,
      status: status || undefined,
      subject: subject || undefined,
      city: city || undefined,
    }),
    [day, kind, status, subject, city]
  );
  const turns = useTurns(query);
  const users = useAdminUsers();

  const setFilters = (next: TurnFilterValues) => {
    // The day is always written: a shared link means that day, not the reader's today.
    const qs = turnFiltersQuery(next);
    router.replace(qs ? `/admin/turns/?${qs}` : "/admin/turns/", { scroll: false });
  };

  return (
    <div>
      <AdminHeading title={t.admin.turns.title} />
      <TurnFilters values={filters} users={users.items} onChange={setFilters} />

      {turns.status !== "ready" ? (
        <AdminLoadState status={turns.status} error={turns.error} onRetry={turns.reload} />
      ) : (
        <>
          <TurnsTable turns={turns.items} bySubject={users.bySubject} />
          <LoadMore hasMore={turns.hasMore} loading={turns.loadingMore} onClick={turns.loadMore} />
        </>
      )}
    </div>
  );
}
