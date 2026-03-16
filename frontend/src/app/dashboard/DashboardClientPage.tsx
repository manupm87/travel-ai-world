"use client";

import { TripSummary } from "@/types/trip-summary";
import EmptyDashboard from "@/components/dashboard/EmptyDashboard";
import Header from "@/components/layout/Header";
import PlannerCard from "@/components/ui/PlannerCard";
import { useLanguage } from "@/context/LanguageContext";
import { TripSection } from "@/components/dashboard/TripSection";

interface DashboardClientPageProps {
  initialTrips: TripSummary[];
}

import ProtectedRoute from "@/components/auth/ProtectedRoute";
import DashboardLayout from "@/components/dashboard/DashboardLayout";


export default function DashboardClientPage({ initialTrips }: DashboardClientPageProps) {
  const { t } = useLanguage();
  const d = t.dashboard;

  const trips = initialTrips;

  const planningTrips = trips.filter((trip) => trip.status === "planning");
  const plannedTrips = trips.filter((trip) => trip.status === "planned");
  const finishedTrips = trips.filter((trip) => trip.status === "finished");

  return (
    <ProtectedRoute>
    <DashboardLayout>

      <PlannerCard transparent />
      
      {trips.length === 0 ? (
        <EmptyDashboard />
      ) : (
        <>
          {/* Your Next Adventure (Planned) */}
          <TripSection title={d.sections.planned} trips={plannedTrips} />

          {/* In the Works (Planning) */}
          <TripSection title={d.sections.planning} trips={planningTrips} transparent />

          {/* Past Journeys (Finished) */}
          <TripSection title={d.sections.finished} trips={finishedTrips} />
        </>
      )}
    </DashboardLayout>
    </ProtectedRoute>
  );
}

