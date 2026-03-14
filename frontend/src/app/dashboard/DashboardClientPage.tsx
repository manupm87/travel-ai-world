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

export default function DashboardClientPage({ initialTrips }: DashboardClientPageProps) {
  const { t } = useLanguage();
  const d = t.dashboard;

  const trips = initialTrips;

  const planningTrips = trips.filter((trip) => trip.status === "planning");
  const plannedTrips = trips.filter((trip) => trip.status === "planned");
  const finishedTrips = trips.filter((trip) => trip.status === "finished");

  return (
    <div className="min-h-screen bg-bg-primary flex flex-col items-center">
      <Header variant="dashboard" />
      
      {/* Content Area */}
      <main className="w-full pt-[72px] flex flex-col">
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
      </main>
    </div>
  );
}
