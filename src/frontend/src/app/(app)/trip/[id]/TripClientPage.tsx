"use client";

import type { Trip } from "@/types/trip";
import TripHeader from "@/components/trip-viewer/trip-header";
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
 * Assembles the trip-viewer sections (header, timeline, overview, insights,
 * itinerary) for the trip fetched by the server component. The shell and the
 * auth guard come from the `(app)` layout.
 *
 * @param trip - The complete Trip data object fetched by the Server Component.
 */
export default function TripClientPage({ trip }: TripClientPageProps) {
  return (
    <div className="flex flex-col pb-20">
      <TripHeader trip={trip} />
      <InteractiveTimeline trip={trip} />
      <TripOverview trip={trip} />
      <AIInsights trip={trip} />
      <Itinerary trip={trip} />
    </div>
  );
}
