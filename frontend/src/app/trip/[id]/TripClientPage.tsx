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


/**
 * Client-Side Trip Viewer (`/trip/[id]`).
 * 
 * This Client Component renders the fully interactive trip view. It is responsible
 * for assembling all the specific trip-viewer UI components (Timeline, Overview, 
 * Itinerary, AI Insights) and passing down the fetched Trip data.
 * 
 * @param trip - The complete Trip data object fetched by the Server Component.
 */
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
