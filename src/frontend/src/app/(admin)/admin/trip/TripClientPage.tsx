"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMemo } from "react";
import { AdminHeading, AdminLoadState } from "@/components/admin/AdminStates";
import { AdminTripView } from "@/components/admin/trip/AdminTripView";
import { TripHeader } from "@/components/admin/trip/TripHeader";
import { TripTurns } from "@/components/admin/trip/TripTurns";
import { useLanguage } from "@/context/LanguageContext";
import { useAdminTrip } from "@/hooks/admin/useAdminTrip";
import { useAdminUsers } from "@/hooks/admin/useAdminUsers";
import { useSessionTurns } from "@/hooks/admin/useSessionTurns";
import { findCity, usePlannerCities } from "@/hooks/usePlannerCities";

/**
 * `/admin/trip/?user=&id=` — one saved trip, read only (TRA-229): who owns
 * it and what it is, the planner's own overview of it, and the turns of the
 * planner session that made it. Nothing on this page writes.
 */
export default function TripClientPage() {
  const { t } = useLanguage();
  const tt = t.admin.trip;
  const params = useSearchParams();
  const state = useAdminTrip(params.get("user"), params.get("id"));
  const users = useAdminUsers();
  const { cities } = usePlannerCities();

  const ready = state.status === "ready" ? state.data : null;
  const sessionId = ready?.dto.planner_session_id ?? null;
  const turns = useSessionTurns(sessionId);
  const slug = ready?.trip.city.slug ?? null;
  const city = useMemo(() => (slug ? findCity(cities, slug) : null), [cities, slug]);

  const back = (
    <Link
      href="/admin/trips/"
      className="inline-flex items-center gap-1.5 rounded text-sm text-text-secondary hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
    >
      <ArrowLeft size={14} aria-hidden="true" />
      {tt.back}
    </Link>
  );

  if (state.status === "not-found") {
    return (
      <div>
        {back}
        <div className="mt-3">
          <AdminHeading title={tt.title} />
        </div>
        <p className="text-text-secondary">{tt.notFound}</p>
      </div>
    );
  }

  if (!ready) {
    return (
      <div>
        {back}
        <div className="mt-3">
          <AdminLoadState
            status={state.status === "error" ? "error" : "loading"}
            error={state.status === "error" ? state.error : null}
            onRetry={state.reload}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="min-w-0">
      {back}
      <div className="mt-3">
        <TripHeader trip={ready.dto} owner={users.byId.get(ready.dto.user_id)} />
      </div>
      <AdminTripView
        itinerary={ready.draft.itinerary}
        brief={ready.draft.brief}
        city={city}
      />
      <TripTurns sessionId={sessionId} state={turns} bySubject={users.bySubject} />
    </div>
  );
}
