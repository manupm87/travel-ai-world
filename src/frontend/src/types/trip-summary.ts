import type { TripPhase } from "@/types/trip";

/**
 * One trip as the planner's trips list shows it: a photograph, a title, where
 * and when, and which of the three phases it is in. Everything else waits
 * until the trip is opened (`/plan/?trip=<id>`).
 */
export interface TripSummary {
  id: string;
  title: string;
  /** The city the trip happens in — one per trip since TRA-196. */
  city: string;
  countryCode: string;
  startDate: string;
  endDate: string;
  phase: TripPhase;
  imageUrl: string;
}
