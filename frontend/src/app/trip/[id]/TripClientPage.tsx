"use client";

import { useParams } from "next/navigation";
import tripDataJson from "@/mocks/trip-grand-european-tour.json";
import { Trip } from "@/types/trip";

import TripHeader from "@/components/trip-viewer/TripHeader";
import DestinationTimeline from "@/components/trip-viewer/DestinationTimeline";
import JourneyMap from "@/components/trip-viewer/JourneyMap";
import TripOverview from "@/components/trip-viewer/TripOverview";
import AIInsights from "@/components/trip-viewer/AIInsights";
import Itinerary from "@/components/trip-viewer/Itinerary";

// Cast imported JSON to Trip type
const mockTrip = tripDataJson as unknown as Trip;

export default function TripClientPage() {
  useParams<{ id: string }>();
  
  // Using the mock data regardless of the URL ID for this implementation
  const trip = mockTrip;

  return (
    <main className="min-h-screen bg-[#0A0A12] flex flex-col font-sans pb-20">
      <TripHeader trip={trip} />
      <DestinationTimeline destinations={trip.destinations} />
      <JourneyMap trip={trip} />
      <TripOverview trip={trip} />
      <AIInsights trip={trip} />
      <Itinerary trip={trip} />
    </main>
  );
}
