/**
 * Trips: the backend contract in, the view model out.
 *
 * `toTrip` / `toTripSummary` are the anti-corruption layer between
 * `TripResponse` (generated from core_api's OpenAPI) and the `Trip` view model
 * the components render (ADR 0006).
 *
 * Every DTO comes from core_api, fetched in the browser with the session
 * token: the dashboard lists the signed-in user's trips (`listTrips`,
 * `GET /api/v1/trips/`) and the viewer loads one (`getTrip`,
 * `GET /api/v1/trips/{id}`). The pages are static shells; nothing about a
 * trip is known at build time (ADR 0011).
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
  TripResponse,
} from "@/types/trip";
import type { TripSummary } from "@/types/trip-summary";
import { ApiError, request } from "./http";

export type { TripResponse };
type DestinationResponse = components["schemas"]["DestinationResponse"];
type ItineraryDayResponse = components["schemas"]["ItineraryDayResponse"];
type ActivityResponse = components["schemas"]["ActivityResponse"];
type MealResponse = components["schemas"]["MealResponse"];
type AccommodationResponse = components["schemas"]["AccommodationResponse"];
type TransportationResponse = components["schemas"]["TransportationResponse"];

// ── API ──────────────────────────────────────────────────────────────────────

/**
 * How many trips one dashboard load asks for. Well above what anyone has
 * today; a paginated or summaries endpoint is the follow-up when that changes.
 */
const LIST_LIMIT = 100;

export interface ListTripsOptions {
  /** Cancels the request (the caller unmounted or asked again). */
  signal?: AbortSignal;
}

/**
 * The caller's trips as dashboard cards, in the order the API returns them.
 * Needs a session: without a token `http.ts` throws `UnauthorizedError`
 * before any network call; a rejected token becomes the same error after it.
 */
export async function listTrips({ signal }: ListTripsOptions = {}): Promise<TripSummary[]> {
  const dtos = await request<TripResponse[]>("core", `/trips/?limit=${LIST_LIMIT}`, {
    auth: true,
    signal,
  });
  return dtos.map(toTripSummary);
}

export interface GetTripOptions {
  /** Cancels the request (the caller unmounted or asked for another id). */
  signal?: AbortSignal;
}

/**
 * One trip as the viewer renders it, or `null` when there is nothing to show:
 * a 404 (no such trip) and a 403 (someone else's trip) both resolve to `null`,
 * so the UI shows the same "not found" page and leaks nothing about other
 * users' ids. Any other failure rethrows (`UnauthorizedError` on 401, or when
 * there is no session, before any network call).
 */
export async function getTrip(id: string, { signal }: GetTripOptions = {}): Promise<Trip | null> {
  try {
    const dto = await request<TripResponse>("core", `/trips/${encodeURIComponent(id)}`, {
      auth: true,
      signal,
    });
    return toTrip(dto);
  } catch (err) {
    if (err instanceof ApiError && (err.status === 404 || err.status === 403)) return null;
    throw err;
  }
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
