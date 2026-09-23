"use client";

import { AdminHeading, AdminLoadState, LoadMore } from "@/components/admin/AdminStates";
import { DataTable } from "@/components/admin/DataTable";
import { phaseTone, Pill } from "@/components/admin/Pill";
import { useLanguage } from "@/context/LanguageContext";
import { useAdminTrips } from "@/hooks/admin/useAdminTrips";
import { displayName, useAdminUsers } from "@/hooks/admin/useAdminUsers";
import { useFormatters } from "@/hooks/useFormatters";
import { interpolate } from "@/i18n";
import type { AdminTripSummary } from "@/services/admin";

/** Where a trip row leads: TRA-229's trip page. */
export function adminTripHref(trip: Pick<AdminTripSummary, "user_id" | "id">): string {
  return `/admin/trip/?user=${encodeURIComponent(trip.user_id)}&id=${encodeURIComponent(trip.id)}`;
}

/** Every saved trip, newest first, with its owner from the users join. */
export default function TripsClientPage() {
  const { t } = useLanguage();
  const tt = t.admin.trips;
  const f = useFormatters();
  const trips = useAdminTrips();
  const users = useAdminUsers();
  const none = t.admin.common.none;

  const date = (iso: string) => f.formatDate(iso, { month: "short", day: "numeric", year: "numeric" });
  const dates = (trip: AdminTripSummary) =>
    trip.start_date && trip.end_date
      ? interpolate(t.plan.trips.dateRange, {
          start: f.formatDate(`${trip.start_date}T12:00:00Z`, { month: "short", day: "numeric", timeZone: "UTC" }),
          end: f.formatDate(`${trip.end_date}T12:00:00Z`, {
            month: "short",
            day: "numeric",
            year: "numeric",
            timeZone: "UTC",
          }),
        })
      : none;

  return (
    <div>
      <AdminHeading title={tt.title} />
      {trips.status !== "ready" ? (
        <AdminLoadState status={trips.status} error={trips.error} onRetry={trips.reload} />
      ) : (
        <>
          <DataTable<AdminTripSummary>
            caption={tt.caption}
            empty={tt.empty}
            rows={trips.items}
            rowKey={(trip) => `${trip.user_id}/${trip.id}`}
            href={adminTripHref}
            columns={[
              { key: "title", header: tt.columns.title, cell: (trip) => trip.title },
              {
                key: "owner",
                header: tt.columns.owner,
                className: "whitespace-nowrap",
                cell: (trip) =>
                  displayName(users.byId.get(trip.user_id)) ?? (
                    <span className="font-mono text-xs">{trip.user_id.slice(0, 8)}</span>
                  ),
              },
              { key: "city", header: tt.columns.city, className: "whitespace-nowrap", cell: (trip) => trip.city },
              { key: "dates", header: tt.columns.dates, className: "whitespace-nowrap", cell: dates },
              {
                key: "phase",
                header: tt.columns.phase,
                cell: (trip) => <Pill tone={phaseTone(trip.phase)}>{t.plan.trips.phase[trip.phase]}</Pill>,
              },
              {
                key: "created",
                header: tt.columns.created,
                numeric: true,
                cell: (trip) => date(trip.created_at),
              },
            ]}
          />
          <LoadMore hasMore={trips.hasMore} loading={trips.loadingMore} onClick={trips.loadMore} />
        </>
      )}
    </div>
  );
}
