/**
 * Trips: the backend contract in, the view model out.
 *
 * `toTrip` / `toTripSummary` are the anti-corruption layer between
 * `TripResponse` (generated from core_api's OpenAPI) and the `Trip` view model
 * the components render. Today the DTOs come from the fixtures in
 * `src/mocks/*.ts`, written in the backend's exact shape and checked with
 * `satisfies`; tomorrow they come from `GET /api/v1/trips/`.
 */

import type { components } from "@/types/generated/core-api";
import type {
  Accommodation,
  Activity,
  ActivityLocation,
  Destination,
  ItineraryDay,
  ItineraryDayKind,
  Meal,
  Transportation,
  Trip,
} from "@/types/trip";
import type { TripSummary } from "@/types/trip-summary";

export type TripResponse = components["schemas"]["TripResponse"];
type DestinationResponse = components["schemas"]["DestinationResponse"];
type ItineraryDayResponse = components["schemas"]["ItineraryDayResponse"];
type ActivityResponse = components["schemas"]["ActivityResponse"];
type MealResponse = components["schemas"]["MealResponse"];
type AccommodationResponse = components["schemas"]["AccommodationResponse"];
type TransportationResponse = components["schemas"]["TransportationResponse"];

// ── Fixtures (backend shape) ─────────────────────────────────────────────────

const tripModules: Record<string, () => Promise<{ default: TripResponse }>> = {
  trip_euro_2026: () => import("@/mocks/trip-grand-european-tour"),
  trip_japan_2026: () => import("@/mocks/trip-japan"),
  trip_ny_2025: () => import("@/mocks/trip-new-york"),
  trip_prague_vienna_budapest_2024: () => import("@/mocks/trip-prague-vienna-budapest"),
};

/** Ids of every trip the static export prerenders. */
export function getAllTripIds(): string[] {
  return Object.keys(tripModules);
}

/** One trip as the viewer renders it, or null when the id is unknown. */
export async function getTripById(id: string): Promise<Trip | null> {
  const loader = tripModules[id];
  if (!loader) return null;
  const { default: dto } = await loader();
  return toTrip(dto);
}

/** Dashboard cards, derived from the same source as the full trips. */
export async function getTripSummaries(): Promise<TripSummary[]> {
  const dtos = await Promise.all(Object.values(tripModules).map((load) => load()));
  return dtos.map(({ default: dto }) => toTripSummary(dto));
}

// ── Mapping ─────────────────────────────────────────────────────────────────

const money = (value: string | null | undefined): number =>
  value == null || value === "" ? 0 : Number(value);
const text = (value: string | null | undefined): string => value ?? "";
const number = (value: number | null | undefined): number => value ?? 0;

const FREE_DAY_MARKERS = ["free day", "día libre", "dia libre"];

/** A day is "free" when its title says so, "travel" when it moves between places. */
export function itineraryDayKind(
  title: string | null | undefined,
  activities: readonly { category?: string | null }[]
): ItineraryDayKind {
  const lower = (title ?? "").toLowerCase();
  if (FREE_DAY_MARKERS.some((marker) => lower.includes(marker))) return "free";
  if (activities.some((a) => a.category === "transport")) return "travel";
  return "regular";
}

function toLocation(dto: {
  location_name?: string | null;
  location_address?: string | null;
  location_city?: string | null;
  location_lat?: number | null;
  location_lng?: number | null;
}): ActivityLocation {
  return {
    name: text(dto.location_name),
    address: text(dto.location_address),
    city: text(dto.location_city),
    coordinates: { lat: number(dto.location_lat), lng: number(dto.location_lng) },
  };
}

function toActivity(dto: ActivityResponse): Activity {
  return {
    id: dto.id,
    time: text(dto.time),
    duration: number(dto.duration_minutes),
    title: dto.title,
    description: text(dto.description),
    location: toLocation(dto),
    category: text(dto.category),
    cost: money(dto.cost),
    bookingRequired: dto.booking_required ?? false,
    bookingUrl: dto.booking_url ?? undefined,
    rating: dto.rating ?? undefined,
  };
}

function toMeal(dto: MealResponse): Meal {
  return {
    id: dto.id,
    time: text(dto.time),
    type: text(dto.type),
    restaurantName: dto.restaurant_name,
    cuisine: text(dto.cuisine),
    location: toLocation(dto),
    estimatedCost: money(dto.estimated_cost),
    rating: dto.rating ?? undefined,
  };
}

function toItineraryDay(dto: ItineraryDayResponse): ItineraryDay {
  return {
    id: dto.id,
    dayNumber: dto.day_number,
    kind: itineraryDayKind(dto.title, dto.activities ?? []),
    date: text(dto.date),
    destinationId: text(dto.destination_id),
    title: text(dto.title),
    description: text(dto.description),
    activities: (dto.activities ?? []).map(toActivity),
    meals: (dto.meals ?? []).map(toMeal),
    estimatedCost: money(dto.estimated_cost),
  };
}

function toDestination(dto: DestinationResponse): Destination {
  return {
    id: dto.id,
    city: dto.city,
    country: dto.country,
    countryCode: dto.country_code,
    coordinates: { lat: number(dto.lat), lng: number(dto.lng) },
    arrivalDate: text(dto.arrival_date),
    departureDate: text(dto.departure_date),
    nightsStaying: number(dto.nights_staying),
  };
}

function toAccommodation(dto: AccommodationResponse): Accommodation {
  return {
    id: dto.id,
    checkIn: text(dto.check_in),
    checkOut: text(dto.check_out),
    name: dto.name,
    type: text(dto.type),
    city: text(dto.city),
    countryCode: text(dto.country_code),
    address: text(dto.address),
    coordinates: { lat: number(dto.lat), lng: number(dto.lng) },
    rating: number(dto.rating),
    pricePerNight: money(dto.price_per_night),
    totalCost: money(dto.total_cost),
    amenities: dto.amenities ?? [],
    checkInTime: text(dto.check_in_time),
    checkOutTime: text(dto.check_out_time),
  };
}

function toTransportation(dto: TransportationResponse): Transportation {
  return {
    id: dto.id,
    type: text(dto.type),
    category: text(dto.category),
    from: text(dto.from_location),
    to: text(dto.to_location),
    fromCity: text(dto.from_city),
    toCity: text(dto.to_city),
    departureTime: text(dto.departure_time),
    arrivalTime: text(dto.arrival_time),
    provider: text(dto.provider),
    flightNumber: dto.flight_number ?? undefined,
    duration: number(dto.duration_minutes),
    cost: money(dto.cost),
    bookingReference: dto.booking_reference ?? undefined,
  };
}

/** Backend `TripResponse` → view model. Every optional becomes a safe default. */
export function toTrip(dto: TripResponse): Trip {
  const hasInsights = dto.ai_weather_forecast != null || (dto.ai_local_tips?.length ?? 0) > 0;
  return {
    id: dto.id,
    userId: String(dto.user_id),
    status: dto.status,
    createdAt: dto.created_at,
    updatedAt: dto.updated_at,
    title: dto.title,
    description: text(dto.description),
    destinations: (dto.destinations ?? []).map(toDestination),
    dates: {
      startDate: text(dto.start_date),
      endDate: text(dto.end_date),
      durationDays: number(dto.duration_days),
    },
    travelers: {
      adults: dto.travelers_adults ?? 1,
      children: dto.travelers_children ?? 0,
      infants: dto.travelers_infants ?? 0,
    },
    budget: {
      total: money(dto.budget_total),
      currency: text(dto.budget_currency),
      breakdown: {
        accommodation: money(dto.budget_accommodation),
        food: money(dto.budget_food),
        activities: money(dto.budget_activities),
        transportation: money(dto.budget_transportation),
        other: money(dto.budget_other),
      },
    },
    preferences: {
      travelStyle: dto.travel_style ?? [],
      pacePreference: text(dto.pace_preference),
      accommodationType: text(dto.accommodation_type),
    },
    itinerary: (dto.itinerary_days ?? [])
      .map(toItineraryDay)
      .sort((a, b) => a.dayNumber - b.dayNumber),
    accommodation: (dto.accommodations ?? []).map(toAccommodation),
    transportation: (dto.transportations ?? []).map(toTransportation),
    aiInsights: hasInsights
      ? { weatherForecast: text(dto.ai_weather_forecast), localTips: dto.ai_local_tips ?? [] }
      : undefined,
  };
}

/** Backend `TripResponse` → dashboard card. */
export function toTripSummary(dto: TripResponse): TripSummary {
  return {
    id: dto.id,
    title: dto.title,
    destinations: (dto.destinations ?? []).map((d) => d.city),
    startDate: text(dto.start_date),
    endDate: text(dto.end_date),
    status: dto.status,
    imageUrl: text(dto.image_url),
  };
}
