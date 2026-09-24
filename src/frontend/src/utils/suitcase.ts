import type { TripSummary } from "@/types/trip-summary";

/**
 * Kiri's stickers (TRA-237): one per city the account has a trip in, in the
 * order the trips come, never twice. The phone menu counts them and the home
 * shows them as chips.
 */
export function stickerCities(trips: TripSummary[]): string[] {
  const seen = new Set<string>();
  const cities: string[] = [];
  for (const trip of trips) {
    const key = trip.city.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    cities.push(trip.city.trim());
  }
  return cities;
}
