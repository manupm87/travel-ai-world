/**
 * Trips: the backend contract in, the view model out.
 *
 * `toTrip` / `toTripSummary` are the anti-corruption layer between
 * `TripResponse` (generated from core_api's OpenAPI) and the `Trip` view model
 * the planner renders (ADR 0006). Since TRA-196 a trip is one city and one
 * saved planner draft, and `phase` — upcoming, ongoing or past — comes down
 * derived from its dates: the planner reads it to decide whether the trip can
 * still be changed.
 *
 * Every DTO comes from core_api, fetched in the browser with the session
 * token: the planner lists the signed-in user's trips (`listTrips`,
 * `GET /api/v1/trips/`) and opens one (`getTrip`, `GET /api/v1/trips/{id}`).
 * The pages are static shells; nothing about a trip is known at build time
 * (ADR 0011).
 *
 * The writes are here too: `createTrip`, `updateTrip`, `deleteTrip` and
 * `saveDraftAsTrip`, which stores a whole planner draft — the trip with its
 * city, one itinerary day per day of the draft with its activities and meals,
 * the stay and the route. core_api takes no trip and its children in one
 * body, so that snapshot is a sequence of small writes, each awaited before
 * the next starts: they all touch the same trip, and the children need the
 * ids the earlier answers carry. Every card is written back whole
 * (`source_ref`, `part_of_day`, `card`), which is what lets
 * `services/tripDraft.ts` rebuild the draft when the trip is reopened.
 */

import type { ItineraryDraft } from "@/hooks/plannerReducer";
import type { components } from "@/types/generated/core-api";
import {
  DAY_PARTS,
  type DayPart,
  type OptionCard,
  type PlannerCity,
  type TripBrief,
} from "@/types/planner";
import type {
  Accommodation,
  Activity,
  ItineraryDay,
  Meal,
  Place,
  SavedCard,
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
type ItineraryDayCreate = components["schemas"]["ItineraryDayCreate"];
type ActivityCreate = components["schemas"]["ActivityCreate"];
type MealCreate = components["schemas"]["MealCreate"];
type MealType = components["schemas"]["MealType"];
type AccommodationCreate = components["schemas"]["AccommodationCreate"];
type TransportationCreate = components["schemas"]["TransportationCreate"];
type ItineraryDayResponse = components["schemas"]["ItineraryDayResponse"];
type ActivityResponse = components["schemas"]["ActivityResponse"];
type MealResponse = components["schemas"]["MealResponse"];
type AccommodationResponse = components["schemas"]["AccommodationResponse"];
type TransportationResponse = components["schemas"]["TransportationResponse"];

// ── API ──────────────────────────────────────────────────────────────────────

/**
 * How many trips one list load asks for. Well above what anyone has today; a
 * paginated or summaries endpoint is the follow-up when that changes.
 */
const LIST_LIMIT = 100;

export interface ListTripsOptions {
  /** Cancels the request (the caller unmounted or asked again). */
  signal?: AbortSignal;
}

/**
 * The caller's trips as list cards, in the order the API returns them.
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
 * One trip as the planner reopens it, or `null` when there is nothing to
 * show: a 404 (no such trip) and a 403 (someone else's trip) both resolve to
 * `null`, so the UI shows the same "not here" pane and leaks nothing about
 * other users' ids. Any other failure rethrows (`UnauthorizedError` on 401,
 * or when there is no session, before any network call).
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

const text = (value: string | null | undefined): string => value ?? "";
const number = (value: number | null | undefined): number => value ?? 0;

/** core_api stores the card as opaque JSON; only an object is worth keeping. */
function savedCard(value: unknown): SavedCard | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as SavedCard)
    : null;
}

function toPlace(dto: {
  location_name?: string | null;
  location_address?: string | null;
  location_city?: string | null;
  location_lat?: number | null;
  location_lng?: number | null;
}): Place {
  return {
    name: text(dto.location_name),
    address: text(dto.location_address),
    city: text(dto.location_city),
    coordinates: { lat: dto.location_lat ?? null, lng: dto.location_lng ?? null },
  };
}

function toActivity(dto: ActivityResponse): Activity {
  return {
    id: dto.id,
    sourceRef: text(dto.source_ref),
    card: savedCard(dto.card),
    partOfDay: dto.part_of_day ?? null,
    time: text(dto.time),
    title: dto.title,
    description: text(dto.description),
    category: text(dto.category),
    place: toPlace(dto),
  };
}

function toMeal(dto: MealResponse): Meal {
  return {
    id: dto.id,
    sourceRef: text(dto.source_ref),
    card: savedCard(dto.card),
    partOfDay: dto.part_of_day ?? null,
    time: text(dto.time),
    type: text(dto.type),
    restaurantName: dto.restaurant_name,
    cuisine: text(dto.cuisine),
    place: toPlace(dto),
  };
}

function toItineraryDay(dto: ItineraryDayResponse): ItineraryDay {
  return {
    id: dto.id,
    dayNumber: dto.day_number,
    date: text(dto.date),
    title: text(dto.title),
    description: text(dto.description),
    activities: (dto.activities ?? []).map(toActivity),
    meals: (dto.meals ?? []).map(toMeal),
  };
}

function toAccommodation(dto: AccommodationResponse): Accommodation {
  return {
    id: dto.id,
    sourceRef: text(dto.source_ref),
    card: savedCard(dto.card),
    name: dto.name,
    type: text(dto.type),
    city: text(dto.city),
    countryCode: text(dto.country_code),
    address: text(dto.address),
    coordinates: { lat: dto.lat ?? null, lng: dto.lng ?? null },
    checkIn: text(dto.check_in),
    checkOut: text(dto.check_out),
  };
}

function toTransportation(dto: TransportationResponse): Transportation {
  return {
    id: dto.id,
    type: text(dto.type),
    category: text(dto.category),
    fromCity: text(dto.from_city),
    toCity: text(dto.to_city),
    departureTime: text(dto.departure_time),
  };
}

/** Backend `TripResponse` → view model. Every optional becomes a safe default. */
export function toTrip(dto: TripResponse): Trip {
  return {
    id: dto.id,
    title: dto.title,
    description: text(dto.description),
    phase: dto.phase,
    city: {
      slug: dto.city_slug,
      name: dto.city,
      country: dto.country,
      countryCode: dto.country_code,
      coordinates: { lat: dto.lat ?? null, lng: dto.lng ?? null },
    },
    origin: text(dto.origin),
    dates: {
      startDate: text(dto.start_date),
      endDate: text(dto.end_date),
      durationDays: number(dto.duration_days),
    },
    travellers: {
      adults: dto.travelers_adults ?? 1,
      children: dto.travelers_children ?? 0,
      infants: dto.travelers_infants ?? 0,
    },
    budgetTier: dto.budget_tier ?? null,
    interests: dto.travel_style ?? [],
    pace: text(dto.pace_preference),
    imageUrl: text(dto.image_url),
    itinerary: (dto.itinerary_days ?? [])
      .map(toItineraryDay)
      .sort((a, b) => a.dayNumber - b.dayNumber),
    // A trip has one hotel; core_api still models the collection, so the
    // first one is the stay and anything after it is history.
    stay: (dto.accommodations ?? []).map(toAccommodation)[0] ?? null,
    legs: (dto.transportations ?? []).map(toTransportation),
    createdAt: dto.created_at,
    updatedAt: dto.updated_at,
  };
}

/** Backend `TripResponse` → one card of the trips list. */
export function toTripSummary(dto: TripResponse): TripSummary {
  return {
    id: dto.id,
    title: dto.title,
    city: dto.city,
    countryCode: dto.country_code,
    startDate: text(dto.start_date),
    endDate: text(dto.end_date),
    phase: dto.phase,
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

/**
 * Patches a trip's own fields; `patch` is all-optional, children are
 * untouched. core_api answers 409 `TRIP_LOCKED` for a trip that is ongoing or
 * past: only an upcoming trip can be changed (ADR 0019).
 */
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

/**
 * Deletes a trip and everything under it (the children cascade). Answers 204,
 * in every phase: a trip that already happened can still be thrown away.
 */
export async function deleteTrip(id: string, { signal }: WriteOptions = {}): Promise<void> {
  await requestRaw("core", tripPath(id), { auth: true, method: "DELETE", signal });
}

/** One child collection of a trip, as core_api routes it. */
type Collection = "itinerary-days" | "accommodations" | "transportations";

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
 * hour that part reads as, beside the part itself. `part_of_day` is what a
 * reopened trip is rebuilt from; the hour is what orders a day for anything
 * that only knows times.
 */
export const PART_TIME: Record<DayPart, string> = {
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
export const EAT = "eat";

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

/** How many days the trip lasts: its dates, or the days the draft has. */
function durationOf(itinerary: ItineraryDraft, brief: TripBrief): number | null {
  return daysBetween(brief.start_date, brief.end_date) ?? (itinerary.days.length || null);
}

/**
 * The card as core_api stores it: a JSON object it never looks inside. The
 * spread is what gives the typed card an index signature; nothing is dropped.
 */
function cardJson(card: OptionCard): SavedCard {
  return { ...card };
}

/**
 * The trip's own fields, city included. `TripCreate` is a superset of
 * `TripUpdate`, so the same body creates a trip and patches one.
 */
function tripBodyOf(
  itinerary: ItineraryDraft,
  brief: TripBrief,
  city: PlannerCity,
  title: string
): TripCreate {
  return {
    title,
    city_slug: city.slug,
    city: city.name,
    country: city.country,
    country_code: city.country_code,
    lat: city.centre[0],
    lng: city.centre[1],
    origin: brief.origin,
    budget_tier: brief.budget_tier,
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

function activityBodyOf(card: OptionCard, part: DayPart, city: string): ActivityCreate {
  return {
    title: card.title,
    description: card.why,
    category: card.category,
    part_of_day: part,
    time: PART_TIME[part],
    source_ref: card.id,
    card: cardJson(card),
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
    part_of_day: part,
    time: PART_TIME[part],
    source_ref: card.id,
    card: cardJson(card),
    location_name: card.title,
    location_city: city,
    location_lat: card.lat,
    location_lng: card.lon,
  };
}

function accommodationBodyOf(
  stay: OptionCard,
  brief: TripBrief,
  city: PlannerCity
): AccommodationCreate {
  return {
    name: stay.title,
    type: "hotel",
    city: city.name,
    country_code: city.country_code,
    source_ref: stay.id,
    card: cardJson(stay),
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
  // Days first: their activities and meals cascade with them.
  for (const day of trip.itinerary_days ?? []) {
    await deleteChild(trip.id, "itinerary-days", day.id, signal);
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
 * The mapping, in one place so the trips list and the reopened planner agree:
 * `city` — the destination as `ai_api` publishes it — becomes the trip's city,
 * the brief its dates, travellers, interests, pace, origin and budget tier;
 * every card in a day becomes an activity, or a meal when the corpus calls it
 * `eat`, carrying its corpus id, its part of the day and the card itself; the
 * stay becomes the accommodation and the route its two legs. What the planner
 * never knows — prices, opening hours, bookings — is left unset rather than
 * invented.
 */
export async function saveDraftAsTrip(
  itinerary: ItineraryDraft,
  brief: TripBrief,
  city: PlannerCity,
  { title, tripId = null, signal }: SaveDraftAsTripOptions
): Promise<Trip> {
  const body = tripBodyOf(itinerary, brief, city, title);

  let id: string;
  if (tripId) {
    const existing = await updateTrip(tripId, body, { signal });
    id = existing.id;
    await clearChildren(existing, signal);
  } else {
    id = (await createTrip(body, { signal })).id;
  }

  for (const day of itinerary.days) {
    const dayBody: ItineraryDayCreate = {
      day_number: day.day,
      date: dateForDay(brief.start_date, day.day),
      title: day.title,
    };
    const saved = await createChild<ItineraryDayResponse>(id, "itinerary-days", dayBody, signal);
    const dayPath = `${tripPath(id)}/itinerary-days/${encodeURIComponent(saved.id)}`;
    for (const part of DAY_PARTS) {
      for (const card of day.slots[part]) {
        const meal = card.category === EAT;
        await request("core", meal ? `${dayPath}/meals/` : `${dayPath}/activities/`, {
          auth: true,
          method: "POST",
          json: meal ? mealBodyOf(card, part, city.name) : activityBodyOf(card, part, city.name),
          signal,
        });
      }
    }
  }

  if (itinerary.stay) {
    await createChild(
      id,
      "accommodations",
      accommodationBodyOf(itinerary.stay, brief, city),
      signal
    );
  }
  for (const leg of transportationBodiesOf(itinerary)) {
    await createChild(id, "transportations", leg, signal);
  }

  // What the trip is now, children and all: the list and the reopened planner
  // read exactly this, so the save hands back the same thing they will.
  return toTrip(await request<TripResponse>("core", tripPath(id), { auth: true, signal }));
}
