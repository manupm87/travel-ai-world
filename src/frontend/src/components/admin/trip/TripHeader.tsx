"use client";

import type { ReactNode } from "react";
import { useLanguage } from "@/context/LanguageContext";
import { useFormatters } from "@/hooks/useFormatters";
import { interpolate } from "@/i18n";
import type { AdminTrip, AdminUser } from "@/services/admin";
import { AdminHeading } from "../AdminStates";
import { phaseTone, Pill } from "../Pill";
import { CopyButton } from "../users/CopyButton";

/** An id in mono that wraps anywhere, with its copy button. */
function MonoId({ value, copyLabel }: { value: string; copyLabel: string }) {
  return (
    <span className="inline-flex max-w-full items-center gap-1">
      <span data-mono-id className="min-w-0 break-all font-mono text-xs">
        {value}
      </span>
      <CopyButton value={value} label={copyLabel} />
    </span>
  );
}

/**
 * The trip page's header (TRA-229): the title, then who owns the trip and
 * what it is — city, dates, phase, when it was saved and changed — and the
 * two ids an administrator pastes elsewhere. It offers nothing to do: no
 * "Open in planner", no rename, no delete.
 */
export function TripHeader({ trip, owner }: { trip: AdminTrip; owner: AdminUser | undefined }) {
  const { t } = useLanguage();
  const tt = t.admin.trip;
  const f = useFormatters();
  const none = t.admin.common.none;

  const day = (date: string, withYear: boolean) =>
    f.formatDate(`${date}T12:00:00Z`, {
      month: "short",
      day: "numeric",
      year: withYear ? "numeric" : undefined,
      timeZone: "UTC",
    });
  const dates =
    trip.start_date && trip.end_date
      ? interpolate(t.plan.trips.dateRange, {
          start: day(trip.start_date, false),
          end: day(trip.end_date, true),
        })
      : none;
  const stamp = (iso: string) =>
    `${f.formatDate(iso, { year: "numeric", month: "short", day: "numeric" })} ${f.formatTime(iso)}`;

  const ownerName = owner?.name?.trim();
  const ownerCell: ReactNode = owner ? (
    <span className="break-words">
      {ownerName ? `${ownerName} · ${owner.email}` : owner.email}
    </span>
  ) : (
    <span className="break-all font-mono text-xs">{trip.user_id}</span>
  );

  const rows: [string, ReactNode][] = [
    [tt.owner, ownerCell],
    [tt.city, [trip.city, trip.country].filter(Boolean).join(", ")],
    [tt.dates, dates],
    [tt.phase, <Pill key="phase" tone={phaseTone(trip.phase)}>{t.plan.trips.phase[trip.phase]}</Pill>],
    [tt.created, stamp(trip.created_at)],
    [tt.updated, stamp(trip.updated_at)],
    [tt.tripId, <MonoId key="trip" value={trip.id} copyLabel={tt.copyTripId} />],
    [
      tt.sessionId,
      trip.planner_session_id ? (
        <MonoId key="session" value={trip.planner_session_id} copyLabel={tt.copySessionId} />
      ) : (
        none
      ),
    ],
  ];

  return (
    <div>
      <AdminHeading title={trip.title} subtitle={tt.readOnly} />
      <section aria-label={tt.details} className="mb-6">
        <dl className="grid gap-x-6 gap-y-2 rounded-xl border border-border-card bg-bg-card p-4 text-sm sm:grid-cols-[max-content_1fr]">
          {rows.map(([label, value]) => (
            <div key={label} className="contents">
              <dt className="text-text-secondary">{label}</dt>
              <dd className="min-w-0 tabular-nums text-text-primary">{value}</dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}
