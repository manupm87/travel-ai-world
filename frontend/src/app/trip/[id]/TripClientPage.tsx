"use client";

import { Trip } from "@/types/trip";

import TripHeader from "@/components/trip-viewer/trip-header";
import Header from "@/components/layout/Header";
import DestinationTimeline from "@/components/trip-viewer/DestinationTimeline";
import JourneyMap from "@/components/trip-viewer/JourneyMap";
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
        <DestinationTimeline destinations={trip.destinations} />
        <JourneyMap trip={trip} />
        <TripOverview trip={trip} />
        <AIInsights trip={trip} />
        <Itinerary trip={trip} />
      </main>
    </div>
  );
}
