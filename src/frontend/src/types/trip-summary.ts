import type { components } from "@/types/generated/core-api";

/** Lifecycle of a trip, as the backend defines it. */
export type TripStatus = components["schemas"]["TripStatus"];

export const TRIP_STATUSES = [
  "planning",
  "planned",
  "finished",
] as const satisfies readonly TripStatus[];

export function isTripStatus(value: string): value is TripStatus {
  return (TRIP_STATUSES as readonly string[]).includes(value);
}

export interface TripSummary {
  id: string;
  title: string;
  destinations: string[]; // e.g. ["Paris", "Rome", "Barcelona"]
  startDate: string;
  endDate: string;
  status: TripStatus;
  imageUrl: string;
}
