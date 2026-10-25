/** The trip summary view model. */

import type { TripPhase } from "@/types/trip";

/**
 * One trip as the trips home lists it: a photograph, a title, where
 * and when, and which of the three phases it is in. Everything else waits
 * until the trip is opened (`/plan/?trip=<id>`).
 */
export interface TripSummary {
  id: string;
  title: string;
  city: string;
  countryCode: string;
  startDate: string;
  endDate: string;
  phase: TripPhase;
  imageUrl: string;
  /** How many days were planned; 0 for a trip saved before any. */
  days: number;
  /** Every activity and meal across those days: the card's "11 stops". */
  stops: number;
}
