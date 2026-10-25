/** Kiri's stickers, from the account's trips. */

import type { TripSummary } from "@/types/trip-summary";

/** Kiri's stickers: one per city the account has a trip in, in the order the trips come. */
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
