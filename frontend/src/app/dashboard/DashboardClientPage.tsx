"use client";

import { TripSummary } from "@/types/trip-summary";
import TripCard from "@/components/trip-viewer/TripCard";
import EmptyDashboard from "@/components/trip-viewer/EmptyDashboard";
import Header from "@/components/layout/Header";
import PlannerCard from "@/components/sections/PlannerCard";
import { useLanguage } from "@/context/LanguageContext";

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
            {plannedTrips.length > 0 && (
              <div className="w-full bg-bg-secondary py-20">
                <section className="max-w-[1440px] w-full mx-auto px-8 lg:px-16 flex flex-col gap-8">
                  <h2 className="text-2xl font-bold text-white">{d.sections.planned}</h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 pb-4">
                    {plannedTrips.map(trip => <TripCard key={trip.id} trip={trip} />)}
                  </div>
                </section>
              </div>
            )}

            {/* In the Works (Planning) */}
            {planningTrips.length > 0 && (
              <div className="w-full bg-transparent py-20">
                <section className="max-w-[1440px] w-full mx-auto px-8 lg:px-16 flex flex-col gap-8">
                  <h2 className="text-2xl font-bold text-white">{d.sections.planning}</h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 pb-4">
                    {planningTrips.map(trip => <TripCard key={trip.id} trip={trip} />)}
                  </div>
                </section>
              </div>
            )}

            {/* Past Journeys (Finished) */}
            {finishedTrips.length > 0 && (
              <div className="w-full bg-bg-secondary py-20">
                <section className="max-w-[1440px] w-full mx-auto px-8 lg:px-16 flex flex-col gap-8">
                  <h2 className="text-2xl font-bold text-white">{d.sections.finished}</h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 pb-4">
                    {finishedTrips.map(trip => <TripCard key={trip.id} trip={trip} />)}
                  </div>
                </section>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
