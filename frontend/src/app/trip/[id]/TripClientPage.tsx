"use client";

import { useParams } from "next/navigation";
import tripEuro from "@/mocks/trip-grand-european-tour.json";
import tripJapan from "@/mocks/trip-japan.json";
import tripNy from "@/mocks/trip-new-york.json";
import tripPvb from "@/mocks/trip-prague-vienna-budapest.json";
import { Trip } from "@/types/trip";

import TripHeader from "@/components/trip-viewer/TripHeader";
import Header from "@/components/layout/Header";
import DestinationTimeline from "@/components/trip-viewer/DestinationTimeline";
import JourneyMap from "@/components/trip-viewer/JourneyMap";
import TripOverview from "@/components/trip-viewer/TripOverview";
import AIInsights from "@/components/trip-viewer/AIInsights";
import Itinerary from "@/components/trip-viewer/Itinerary";

const mockDataMap: Record<string, unknown> = {
  "trip_euro_2026": tripEuro,
  "trip_japan_2026": tripJapan,
  "trip_ny_2025": tripNy,
  "trip_prague_vienna_budapest_2024": tripPvb,
};

export default function TripClientPage() {
  const params = useParams<{ id: string }>();
  
  // Get the id, fallback to euro if not found for some reason
  const tripData = mockDataMap[params?.id as string] || tripEuro;
  const trip = tripData as unknown as Trip;

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
