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
 *
 * The writes are here too (TRA-191): `createTrip`, `updateTrip`, `deleteTrip`
 * and `saveDraftAsTrip`, which stores a whole planner draft — the trip, its
 * destination, one itinerary day per day of the draft with its activities and
 * meals, the stay and the route. core_api takes no trip and its children in
 * one body, so that snapshot is a sequence of small writes, each awaited
 * before the next starts: they all touch the same trip, and the children need
 * the ids the earlier answers carry.
 */

import type { ItineraryDraft } from "@/hooks/plannerReducer";
import type { components } from "@/types/generated/core-api";
import { DAY_PARTS, type DayPart, type OptionCard, type TripBrief } from "@/types/planner";
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
import { dateForDay, daysBetween } from "@/utils/tripDates";
import { ApiError, request, requestRaw } from "./http";

export type { TripResponse };
export type TripUpdate = components["schemas"]["TripUpdate"];
type TripCreate = components["schemas"]["TripCreate"];
type DestinationCreate = components["schemas"]["DestinationCreate"];
type ItineraryDayCreate = components["schemas"]["ItineraryDayCreate"];
type ActivityCreate = components["schemas"]["ActivityCreate"];
type MealCreate = components["schemas"]["MealCreate"];
type MealType = components["schemas"]["MealType"];
type AccommodationCreate = components["schemas"]["AccommodationCreate"];
type TransportationCreate = components["schemas"]["TransportationCreate"];
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

// ── Writes ──────────────────────────────────────────────────────────────────

export interface WriteOptions {
  /** Cancels the request (the caller unmounted or asked again). */
  signal?: AbortSignal;
}

const tripPath = (id: string) => `/trips/${encodeURIComponent(id)}`;

/** Creates a trip and resolves with it as core_api stored it. */
export async function createTrip(
  input: TripCreate,
  { signal }: WriteOptions = {}
): Promise<TripResponse> {
  return request<TripResponse>("core", "/trips/", {
    auth: true,
    method: "POST",
    json: input,
    signal,
  });
}

/** Patches a trip's own fields; `patch` is all-optional, children are untouched. */
export async function updateTrip(
  id: string,
  patch: TripUpdate,
  { signal }: WriteOptions = {}
): Promise<TripResponse> {
  return request<TripResponse>("core", tripPath(id), {
    auth: true,
    method: "PATCH",
    json: patch,
    signal,
  });
}

/** Deletes a trip and everything under it (the children cascade). Answers 204. */
export async function deleteTrip(id: string, { signal }: WriteOptions = {}): Promise<void> {
  await requestRaw("core", tripPath(id), { auth: true, method: "DELETE", signal });
}

/** One child collection of a trip, as core_api routes it. */
type Collection = "destinations" | "itinerary-days" | "accommodations" | "transportations";

async function createChild<T>(
  tripId: string,
  collection: Collection,
  json: unknown,
  signal?: AbortSignal
): Promise<T> {
  return request<T>("core", `${tripPath(tripId)}/${collection}/`, {
    auth: true,
    method: "POST",
    json,
    signal,
  });
}

async function deleteChild(
  tripId: string,
  collection: Collection,
  childId: string,
  signal?: AbortSignal
): Promise<void> {
  await requestRaw("core", `${tripPath(tripId)}/${collection}/${encodeURIComponent(childId)}`, {
    auth: true,
    method: "DELETE",
    signal,
  });
}

// ── The snapshot: a planner draft as a trip ─────────────────────────────────

/**
 * When each part of the day happens. The planner never gives an activity an
 * hour — it places it in a part of the day — so the saved trip carries the
 * hour that part reads as, which is what the viewer orders a day by.
 */
const PART_TIME: Record<DayPart, string> = {
  morning: "10:00",
  afternoon: "15:00",
  evening: "19:00",
  night: "22:00",
};

/** And which meal a restaurant in that part of the day is. */
const PART_MEAL: Record<DayPart, MealType> = {
  morning: "breakfast",
  afternoon: "lunch",
  evening: "dinner",
  night: "dinner",
};

/** The corpus category that makes a card a meal rather than an activity. */
const EAT = "eat";

/**
 * `DestinationCreate` wants a country and a two-letter code; a `PlannerCity`
 * carries neither (`ai_api` publishes a name, a centre, a timezone and an
 * intro). Until it does, the cities the planner covers — and the ones it is
 * likely to cover next — are resolved here, under the names a traveller types
 * in either language. Anything else keeps the city's own name as the country
 * and `EU` as the code: wrong is worse than plainly unknown.
 */
const COUNTRIES: Record<string, { country: string; code: string }> = {
  amsterdam: { country: "Netherlands", code: "NL" },
  athens: { country: "Greece", code: "GR" },
  atenas: { country: "Greece", code: "GR" },
  barcelona: { country: "Spain", code: "ES" },
  berlin: { country: "Germany", code: "DE" },
  "berlín": { country: "Germany", code: "DE" },
  bologna: { country: "Italy", code: "IT" },
  bolonia: { country: "Italy", code: "IT" },
  budapest: { country: "Hungary", code: "HU" },
  copenhagen: { country: "Denmark", code: "DK" },
  copenhague: { country: "Denmark", code: "DK" },
  dublin: { country: "Ireland", code: "IE" },
  "dublín": { country: "Ireland", code: "IE" },
  florence: { country: "Italy", code: "IT" },
  florencia: { country: "Italy", code: "IT" },
  lisbon: { country: "Portugal", code: "PT" },
  lisboa: { country: "Portugal", code: "PT" },
  london: { country: "United Kingdom", code: "GB" },
  londres: { country: "United Kingdom", code: "GB" },
  madrid: { country: "Spain", code: "ES" },
  milan: { country: "Italy", code: "IT" },
  "milán": { country: "Italy", code: "IT" },
  paris: { country: "France", code: "FR" },
  "parís": { country: "France", code: "FR" },
  porto: { country: "Portugal", code: "PT" },
  prague: { country: "Czechia", code: "CZ" },
  praga: { country: "Czechia", code: "CZ" },
  rome: { country: "Italy", code: "IT" },
  roma: { country: "Italy", code: "IT" },
  seville: { country: "Spain", code: "ES" },
  sevilla: { country: "Spain", code: "ES" },
  valencia: { country: "Spain", code: "ES" },
  venice: { country: "Italy", code: "IT" },
  venecia: { country: "Italy", code: "IT" },
  vienna: { country: "Austria", code: "AT" },
  viena: { country: "Austria", code: "AT" },
};

/** The continent stands in for a country nobody here knows. */
const UNKNOWN_COUNTRY_CODE = "EU";

/** The country of a destination the planner names, as far as we know it. */
export function countryOf(city: string): { country: string; code: string } {
  return (
    COUNTRIES[city.trim().toLowerCase()] ?? { country: city, code: UNKNOWN_COUNTRY_CODE }
  );
}

/** Every card of the draft, stay first, in the order the trip reads. */
function cardsOf(itinerary: ItineraryDraft): OptionCard[] {
  const cards = itinerary.stay ? [itinerary.stay] : [];
  for (const day of itinerary.days) {
    for (const part of DAY_PARTS) cards.push(...day.slots[part]);
  }
  return cards;
}

/** The trip's cover: the stay's photo, or the first one the draft has. */
function coverOf(itinerary: ItineraryDraft): string | null {
  return cardsOf(itinerary).find((card) => !!card.image_url)?.image_url ?? null;
}

/** Where the destination sits: the first card of the draft that is located. */
function centreOf(itinerary: ItineraryDraft): { lat: number; lng: number } | null {
  for (const card of cardsOf(itinerary)) {
    if (card.lat !== null && card.lon !== null) return { lat: card.lat, lng: card.lon };
  }
  return null;
}

/** How many days the trip lasts: its dates, or the days the draft has. */
function durationOf(itinerary: ItineraryDraft, brief: TripBrief): number | null {
  return daysBetween(brief.start_date, brief.end_date) ?? (itinerary.days.length || null);
}

/**
 * The trip's own fields. `TripCreate` is a superset of `TripUpdate`, so the
 * same body creates a trip and patches one.
 */
function tripBodyOf(itinerary: ItineraryDraft, brief: TripBrief, title: string): TripCreate {
  return {
    title,
    status: "planning",
    start_date: brief.start_date,
    end_date: brief.end_date,
    duration_days: durationOf(itinerary, brief),
    travelers_adults: brief.adults ?? 1,
    travelers_children: brief.children ?? 0,
    travelers_infants: 0,
    travel_style: brief.interests,
    pace_preference: brief.pace,
    budget_currency: "EUR",
    image_url: coverOf(itinerary),
  };
}

function destinationBodyOf(itinerary: ItineraryDraft, brief: TripBrief): DestinationCreate {
  const city = brief.destination ?? "";
  const { country, code } = countryOf(city);
  const centre = centreOf(itinerary);
  return {
    city,
    country,
    country_code: code,
    arrival_date: brief.start_date,
    departure_date: brief.end_date,
    nights_staying: brief.nights,
    lat: centre?.lat ?? null,
    lng: centre?.lng ?? null,
  };
}

function activityBodyOf(card: OptionCard, part: DayPart, city: string): ActivityCreate {
  return {
    title: card.title,
    description: card.why,
    category: card.category,
    time: PART_TIME[part],
    booking_required: false,
    location_name: card.title,
    location_city: city,
    location_lat: card.lat,
    location_lng: card.lon,
  };
}

function mealBodyOf(card: OptionCard, part: DayPart, city: string): MealCreate {
  return {
    restaurant_name: card.title,
    type: PART_MEAL[part],
    // The corpus has no cuisine field; the card's own one-liner ("Retro
    // Hungarian") is the closest thing it publishes.
    cuisine: card.subtitle,
    time: PART_TIME[part],
    location_name: card.title,
    location_city: city,
    location_lat: card.lat,
    location_lng: card.lon,
  };
}

function accommodationBodyOf(stay: OptionCard, brief: TripBrief): AccommodationCreate {
  return {
    name: stay.title,
    type: "hotel",
    city: brief.destination,
    country_code: countryOf(brief.destination ?? "").code,
    check_in: brief.start_date,
    check_out: brief.end_date,
    lat: stay.lat,
    lng: stay.lon,
  };
}

/** A date with no hour, as a `date-time`: the route carries days, not times. */
const atMidnight = (date: string | null): string | null => (date ? `${date}T00:00:00Z` : null);

/** The route as the two legs it is; the return leg only when there is one. */
function transportationBodiesOf(itinerary: ItineraryDraft): TransportationCreate[] {
  const route = itinerary.route;
  if (!route) return [];
  const legs: TransportationCreate[] = [
    {
      category: "outbound",
      from_location: route.origin,
      to_location: route.destination,
      from_city: route.origin,
      to_city: route.destination,
      departure_time: atMidnight(route.outbound_date),
    },
  ];
  if (route.return_date) {
    legs.push({
      category: "return",
      from_location: route.destination,
      to_location: route.origin,
      from_city: route.destination,
      to_city: route.origin,
      departure_time: atMidnight(route.return_date),
    });
  }
  return legs;
}

export interface SaveDraftAsTripOptions extends WriteOptions {
  /**
   * The trip's title, already in the reader's language: services know no
   * copy, so the caller (`hooks/useSaveTrip.ts`) interpolates it.
   */
  title: string;
  /** Rewrite this trip instead of creating one: the second "Save trip". */
  tripId?: string | null;
}

/** Drops everything hanging off a trip, so the snapshot can be written again. */
async function clearChildren(trip: TripResponse, signal?: AbortSignal): Promise<void> {
  // Days first: their activities and meals cascade with them, and their
  // destination is only a nullable reference (`ON DELETE SET NULL`).
  for (const day of trip.itinerary_days ?? []) {
    await deleteChild(trip.id, "itinerary-days", day.id, signal);
  }
  for (const destination of trip.destinations ?? []) {
    await deleteChild(trip.id, "destinations", destination.id, signal);
  }
  for (const accommodation of trip.accommodations ?? []) {
    await deleteChild(trip.id, "accommodations", accommodation.id, signal);
  }
  for (const transportation of trip.transportations ?? []) {
    await deleteChild(trip.id, "transportations", transportation.id, signal);
  }
}

/**
 * Writes the planner's draft as one trip and resolves with the trip core_api
 * ended up holding.
 *
 * Without `tripId` the trip is created; with one it is rewritten — the trip's
 * fields are patched, every child is deleted and the draft is written again,
 * so a second "Save trip" updates the same trip instead of leaving a second
 * one behind. Every request is awaited before the next: they all touch one
 * trip, and each day's activities need the id that day's answer carries.
 *
 * The mapping, in one place so the dashboard and the viewer agree with the
 * planner: the itinerary's days become itinerary days dated from the brief's
 * start; every card in a day becomes an activity, or a meal when the corpus
 * calls it `eat`, at the hour its part of the day reads as; the stay becomes
 * the accommodation and the route its two legs. What the planner never knows
 * — prices, opening hours, bookings — is left unset rather than invented.
 */
export async function saveDraftAsTrip(
  itinerary: ItineraryDraft,
  brief: TripBrief,
  { title, tripId = null, signal }: SaveDraftAsTripOptions
): Promise<Trip> {
  const body = tripBodyOf(itinerary, brief, title);

  let id: string;
  if (tripId) {
    const existing = await updateTrip(tripId, body, { signal });
    id = existing.id;
    await clearChildren(existing, signal);
  } else {
    id = (await createTrip(body, { signal })).id;
  }

  const city = brief.destination ?? "";
  const destination = await createChild<DestinationResponse>(
    id,
    "destinations",
    destinationBodyOf(itinerary, brief),
    signal
  );

  for (const day of itinerary.days) {
    const dayBody: ItineraryDayCreate = {
      day_number: day.day,
      date: dateForDay(brief.start_date, day.day),
      title: day.title,
      destination_id: destination.id,
    };
    const saved = await createChild<ItineraryDayResponse>(id, "itinerary-days", dayBody, signal);
    const dayPath = `${tripPath(id)}/itinerary-days/${encodeURIComponent(saved.id)}`;
    for (const part of DAY_PARTS) {
      for (const card of day.slots[part]) {
        const meal = card.category === EAT;
        await request("core", meal ? `${dayPath}/meals/` : `${dayPath}/activities/`, {
          auth: true,
          method: "POST",
          json: meal ? mealBodyOf(card, part, city) : activityBodyOf(card, part, city),
          signal,
        });
      }
    }
  }

  if (itinerary.stay) {
    await createChild(id, "accommodations", accommodationBodyOf(itinerary.stay, brief), signal);
  }
  for (const leg of transportationBodiesOf(itinerary)) {
    await createChild(id, "transportations", leg, signal);
  }

  // What the trip is now, children and all: the dashboard and the viewer read
  // exactly this, so the planner hands back the same thing they will.
  return toTrip(await request<TripResponse>("core", tripPath(id), { auth: true, signal }));
}
