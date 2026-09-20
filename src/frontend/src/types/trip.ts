/**
 * The trip **view model**: one trip, one city, as the planner reopens it.
 *
 * It is derived from the backend contract (`TripResponse` in
 * `types/generated/core-api.ts`) by `services/trips.ts::toTrip`, never
 * declared by hand for a response. Keep it convenient for the UI (nested,
 * camelCase, no nulls where a default will do); keep the mapping in the
 * service.
 *
 * Since TRA-196 a trip is a saved planner draft and nothing else: it carries
 * the city it happens in, the brief it was planned from, and on every card
 * the planner's own `OptionCard` — so `services/tripDraft.ts` can rebuild the
 * draft exactly and `/plan/?trip=<id>` opens it where it was left.
 */

import type { components } from "@/types/generated/core-api";

/** The wire shape `toTrip` consumes: core_api's `TripResponse`, re-exported here so
 * fixtures and services name it without reaching into the generated module. */
export type TripResponse = components["schemas"]["TripResponse"];

/**
 * Where a trip stands today, derived by core_api from its dates alone and
 * never stored: today is the server's, so a trip becomes ongoing and then
 * past on its own, without anyone saving it again.
 */
export type TripPhase = TripResponse["phase"];

/**
 * The order the phases read in: what is happening now, what is coming, what
 * already happened. Also the order the trips list groups them in.
 */
export const TRIP_PHASES = ["ongoing", "upcoming", "past"] as const satisfies readonly TripPhase[];

/** Only an upcoming trip can still be changed; the other two are read-only. */
export function isEditable(phase: TripPhase): boolean {
  return phase === "upcoming";
}

/** Which part of the day a card sits in, as core_api stores it. */
export type PartOfDay = NonNullable<components["schemas"]["ActivityResponse"]["part_of_day"]>;

/**
 * The planner card a saved child came from, exactly as the client sent it.
 * core_api stores it as opaque JSON, so it arrives typed as an object and is
 * checked structurally where it is used (`services/tripDraft.ts`).
 */
export type SavedCard = { [key: string]: unknown };

export interface Coordinates {
  lat: number | null;
  lng: number | null;
}

/** The one city a trip happens in (TRA-196): the key back into the planner. */
export interface TripCity {
  /** The planner city's slug (`budapest`), which `findCity` resolves. */
  slug: string;
  name: string;
  country: string;
  countryCode: string;
  /** The city centre, where the map opens before a day has coordinates. */
  coordinates: Coordinates;
}

export interface Place {
  name: string;
  address: string;
  city: string;
  coordinates: Coordinates;
}

/** What every saved card keeps of the planner card it was picked from. */
export interface CardOrigin {
  /** The corpus document id the card came from; empty when it carries none. */
  sourceRef: string;
  /** The card itself, or `null` — then it is rebuilt from the columns. */
  card: SavedCard | null;
  /** Where in the day it sits; `null` falls back to `time`. */
  partOfDay: PartOfDay | null;
}

export interface Activity extends CardOrigin {
  id: string;
  time: string;
  title: string;
  description: string;
  category: string;
  place: Place;
}

export interface Meal extends CardOrigin {
  id: string;
  time: string;
  type: string;
  restaurantName: string;
  cuisine: string;
  place: Place;
}

export interface ItineraryDay {
  id: string;
  dayNumber: number;
  date: string;
  title: string;
  description: string;
  activities: Activity[];
  meals: Meal[];
}

export interface Accommodation {
  id: string;
  sourceRef: string;
  card: SavedCard | null;
  name: string;
  type: string;
  city: string;
  countryCode: string;
  address: string;
  coordinates: Coordinates;
  checkIn: string;
  checkOut: string;
}

export interface Transportation {
  id: string;
  type: string;
  /** `outbound` or `return`: which half of the route this leg is. */
  category: string;
  fromCity: string;
  toCity: string;
  /** ISO date-time; the planner only ever knows the day. */
  departureTime: string;
}

export interface Trip {
  id: string;
  title: string;
  description: string;
  /** Derived by core_api from the dates; the planner locks on it. */
  phase: TripPhase;
  city: TripCity;
  /** Where the traveller leaves from, in their own words; empty when unknown. */
  origin: string;
  dates: {
    startDate: string;
    endDate: string;
    durationDays: number;
  };
  travellers: {
    adults: number;
    children: number;
    infants: number;
  };
  /** 1, 2 or 3 — the brief's `budget_tier`; `null` when it was never asked. */
  budgetTier: number | null;
  interests: string[];
  pace: string;
  imageUrl: string;
  itinerary: ItineraryDay[];
  /** The hotel, or `null`: a trip has at most one. */
  stay: Accommodation | null;
  /** The route there and back, as the two legs it is. */
  legs: Transportation[];
  createdAt: string;
  updatedAt: string;
}
