"use client";

import { Trip } from "@/types/trip";

import TripHeader from "@/components/trip-viewer/trip-header";
import Header from "@/components/layout/Header";
import InteractiveTimeline from "@/components/trip-viewer/InteractiveTimeline";
import TripOverview from "@/components/trip-viewer/TripOverview";
import AIInsights from "@/components/trip-viewer/AIInsights";
import Itinerary from "@/components/trip-viewer/itinerary";

interface TripClientPageProps {
  trip: Trip;
}

export default function TripClientPage({ trip }: TripClientPageProps) {

  return (
    <div className="min-h-screen bg-bg-primary flex flex-col font-sans">
      <Header variant="dashboard" />
      <main className="flex flex-col flex-1 pb-20 pt-[72px]">
        <TripHeader trip={trip} />
        <InteractiveTimeline trip={trip} />
        <TripOverview trip={trip} />
        <AIInsights />
        <Itinerary trip={trip} />
      </main>
    </div>
  );
}
