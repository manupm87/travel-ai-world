"use client";

import { useEffect, useState } from "react";
import tripsMock from "@/mocks/trips-list.json";
import { TripSummary } from "@/types/trip-summary";
import TripCard from "@/components/trip-viewer/TripCard";
import Header from "@/components/layout/Header";
import PlannerCard from "@/components/sections/PlannerCard";
import { useLanguage } from "@/context/LanguageContext";

export default function DashboardClientPage() {
  const { t } = useLanguage();
  const d = t.dashboard;

  const [trips] = useState<TripSummary[]>(tripsMock as TripSummary[]);

  const planningTrips = trips.filter((t) => t.status === "planning");
  const plannedTrips = trips.filter((t) => t.status === "planned");
  const finishedTrips = trips.filter((t) => t.status === "finished");

  return (
    <div className="min-h-screen bg-[#0A0A12] flex flex-col items-center">
      <Header variant="dashboard" />
      
      {/* Content Area */}
      <main className="w-full pt-[72px] flex flex-col">
        <PlannerCard transparent />
        
        {/* Your Next Adventure (Planned) */}
        {plannedTrips.length > 0 && (
          <div className="w-full bg-[#0E0E1A] py-20 px-8 lg:px-[120px]">
            <section className="max-w-[1440px] mx-auto flex flex-col gap-8">
              <h2 className="text-2xl font-bold text-white">{d.sections.planned}</h2>
              <div className="flex gap-8 overflow-x-auto pb-4">
                {plannedTrips.map(trip => <TripCard key={trip.id} trip={trip} />)}
              </div>
            </section>
          </div>
        )}

        {/* In the Works (Planning) */}
        {planningTrips.length > 0 && (
          <div className="w-full bg-transparent py-20 px-8 lg:px-[120px]">
            <section className="max-w-[1440px] mx-auto flex flex-col gap-8">
              <h2 className="text-2xl font-bold text-white">{d.sections.planning}</h2>
              <div className="flex gap-8 overflow-x-auto pb-4">
                {planningTrips.map(trip => <TripCard key={trip.id} trip={trip} />)}
              </div>
            </section>
          </div>
        )}

        {/* Past Journeys (Finished) */}
        {finishedTrips.length > 0 && (
          <div className="w-full bg-[#0E0E1A] py-20 px-8 lg:px-[120px]">
            <section className="max-w-[1440px] mx-auto flex flex-col gap-8">
              <h2 className="text-2xl font-bold text-white">{d.sections.finished}</h2>
              <div className="flex gap-8 overflow-x-auto pb-4">
                {finishedTrips.map(trip => <TripCard key={trip.id} trip={trip} />)}
              </div>
            </section>
          </div>
        )}

      </main>
    </div>
  );
}
