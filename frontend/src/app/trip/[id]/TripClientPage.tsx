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


import ProtectedRoute from "@/components/auth/ProtectedRoute";
import TripViewLayout from "@/components/trip-viewer/TripViewLayout";


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
    <ProtectedRoute>
    <TripViewLayout>
      <TripHeader trip={trip} />
      <InteractiveTimeline trip={trip} />
      <TripOverview trip={trip} />
      <AIInsights trip={trip} />
      <Itinerary trip={trip} />
    </TripViewLayout>
    </ProtectedRoute>
  );
}

