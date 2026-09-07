/**
 * The trip **view model**: the shape the trip-viewer components render.
 *
 * It is derived from the backend contract (`TripResponse` in
 * `types/generated/core-api.ts`) by `services/trips.ts::toTrip`, never
 * declared by hand for a response. Keep it convenient for the UI (nested,
 * camelCase, no nulls); keep the mapping in the service.
 */

import type { components } from "@/types/generated/core-api";
import type { TripStatus } from "@/types/trip-summary";

/** The wire shape `toTrip` consumes: core_api's `TripResponse`, re-exported here so
 * fixtures and services name it without reaching into the generated module. */
export type TripResponse = components["schemas"]["TripResponse"];

export interface Coordinates {
  lat: number;
  lng: number;
}

export interface ActivityLocation {
  name: string;
  address: string;
  city: string;
  coordinates: Coordinates;
}

export interface Activity {
  id: string;
  time: string;
  duration: number; // in minutes
  title: string;
  description: string;
  location: ActivityLocation;
  category: string;
  cost: number;
  bookingRequired: boolean;
  bookingUrl?: string;
  rating?: number;
}

export interface Meal {
  id: string;
  time: string;
  type: string;
  restaurantName: string;
  cuisine: string;
  location: ActivityLocation;
  estimatedCost: number;
  rating?: number;
}

/** How a day reads at a glance; derived once in the mapper, not in JSX. */
export type ItineraryDayKind = "free" | "travel" | "regular";

export interface ItineraryDay {
  id: string;
  dayNumber: number;
  kind: ItineraryDayKind;
  date: string;
  destinationId: string;
  title: string;
  description: string;
  activities: Activity[];
  meals: Meal[];
  estimatedCost: number;
}

export interface Destination {
  id: string;
  city: string;
  country: string;
  countryCode: string;
  coordinates: Coordinates;
  arrivalDate: string;
  departureDate: string;
  nightsStaying: number;
}

export interface Budget {
  total: number;
  currency: string;
  breakdown: {
    accommodation: number;
    food: number;
    activities: number;
    transportation: number;
    other: number;
  };
}

export interface Accommodation {
  id: string;
  checkIn: string;
  checkOut: string;
  name: string;
  type: string;
  city: string;
  countryCode: string;
  address: string;
  coordinates: Coordinates;
  rating: number;
  pricePerNight: number;
  totalCost: number;
  amenities: string[];
  checkInTime: string;
  checkOutTime: string;
}

export interface Transportation {
  id: string;
  type: string;
  category: string;
  from: string;
  to: string;
  fromCity: string;
  toCity: string;
  departureTime: string;
  arrivalTime: string;
  provider: string;
  flightNumber?: string;
  duration: number;
  cost: number;
  bookingReference?: string;
}

export interface AIInsights {
  weatherForecast: string;
  localTips: string[];
}

export interface Trip {
  id: string;
  userId: string;
  status: TripStatus;
  createdAt: string;
  updatedAt: string;
  title: string;
  description: string;
  destinations: Destination[];
  dates: {
    startDate: string;
    endDate: string;
    durationDays: number;
  };
  travelers: {
    adults: number;
    children: number;
    infants: number;
  };
  budget: Budget;
  preferences: {
    travelStyle: string[];
    pacePreference: string;
    accommodationType: string;
  };
  itinerary: ItineraryDay[];
  accommodation: Accommodation[];
  transportation: Transportation[];
  aiInsights?: AIInsights;
}
