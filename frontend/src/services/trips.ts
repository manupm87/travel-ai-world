import type { Trip } from "@/types/trip";
import type { TripSummary } from "@/types/trip-summary";

// Today: reads from JSON. Tomorrow: calls an API.
const tripModules: Record<string, () => Promise<{ default: unknown }>> = {
  trip_euro_2026: () => import("@/mocks/trip-grand-european-tour.json"),
  trip_japan_2026: () => import("@/mocks/trip-japan.json"),
  trip_ny_2025: () => import("@/mocks/trip-new-york.json"),
  trip_prague_vienna_budapest_2024: () => import("@/mocks/trip-prague-vienna-budapest.json"),
};

/**
 * Returns all available trip identifiers.
 */
export function getAllTripIds(): string[] {
  return Object.keys(tripModules);
}

/**
 * Fetches a full trip by its ID.
 */
export async function getTripById(id: string): Promise<Trip | null> {
  const loader = tripModules[id];
  if (!loader) return null;
  const mod = await loader();
  return mod.default as Trip;
}

/**
 * Fetches a list of all trip summaries for the dashboard.
 */
export async function getTripSummaries(): Promise<TripSummary[]> {
  const mod = await import("@/mocks/trips-list.json");
  return mod.default as TripSummary[];
}
