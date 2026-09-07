"use client";

import type { TripSummary } from "@/types/trip-summary";
import EmptyDashboard from "@/components/dashboard/EmptyDashboard";
import PlannerCard from "@/components/planner/PlannerCard";
import { TripSection } from "@/components/dashboard/TripSection";
import { useLanguage } from "@/context/LanguageContext";
import { TRIP_STATUSES } from "@/types/trip-summary";

interface DashboardClientPageProps {
  initialTrips: TripSummary[];
}

/** Section order on the dashboard: upcoming first, then drafts, then history. */
const SECTION_ORDER = ["planned", "planning", "finished"] as const satisfies readonly (typeof TRIP_STATUSES)[number][];

export default function DashboardClientPage({ initialTrips }: DashboardClientPageProps) {
  const { t } = useLanguage();
  const trips = initialTrips;

  return (
    <>
      <PlannerCard transparent />

      {trips.length === 0 ? (
        <EmptyDashboard />
      ) : (
        SECTION_ORDER.map((status) => (
          <TripSection
            key={status}
            title={t.dashboard.sections[status]}
            trips={trips.filter((trip) => trip.status === status)}
            transparent={status === "planning"}
          />
        ))
      )}
    </>
  );
}
