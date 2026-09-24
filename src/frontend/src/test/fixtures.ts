import type {
  Accommodation,
  Activity,
  ItineraryDay,
  Meal,
  Transportation,
  Trip,
} from "@/types/trip";
import type { TripSummary } from "@/types/trip-summary";

/**
 * Typed fixture builders. Every builder returns a complete, valid object so
 * tests never need `as unknown as Trip`; pass only the fields that matter.
 *
 * One trip, one city (TRA-196). When a test needs a whole `TripResponse` — the
 * wire shape, not the view model — it uses `fixtures/trip-budapest.ts`.
 */

const budapest = { lat: 47.4979, lng: 19.0402 };

export function makeActivity(overrides: Partial<Activity> = {}): Activity {
  return {
    id: "act-parliament",
    sourceRef: "wv:en:Budapest/Lipótváros#see:parliament",
    card: null,
    partOfDay: "morning",
    time: "10:00",
    title: "Hungarian Parliament Building",
    description: "The river front from the Pest side.",
    category: "see",
    place: {
      name: "Hungarian Parliament Building",
      address: "Kossuth Lajos tér 1-3",
      city: "Budapest",
      coordinates: budapest,
    },
    ...overrides,
  };
}

export function makeMeal(overrides: Partial<Meal> = {}): Meal {
  return {
    id: "meal-menza",
    sourceRef: "wv:en:Budapest/Terézváros#eat:menza",
    card: null,
    partOfDay: "evening",
    time: "19:00",
    type: "dinner",
    restaurantName: "Menza",
    cuisine: "Retro Hungarian",
    place: {
      name: "Menza",
      address: "Liszt Ferenc tér 2",
      city: "Budapest",
      coordinates: budapest,
    },
    ...overrides,
  };
}

export function makeItineraryDay(overrides: Partial<ItineraryDay> = {}): ItineraryDay {
  return {
    id: "day-1",
    dayNumber: 1,
    date: "2026-10-23",
    title: "Arrival: Belváros and the Danube",
    description: "",
    activities: [],
    meals: [],
    ...overrides,
  };
}

export function makeAccommodation(overrides: Partial<Accommodation> = {}): Accommodation {
  return {
    id: "acc-rum",
    sourceRef: "osm:node/5873075722",
    card: null,
    name: "Hotel Rum Budapest",
    type: "hotel",
    city: "Budapest",
    countryCode: "HU",
    address: "Királyi Pál utca 4",
    coordinates: budapest,
    checkIn: "2026-10-23",
    checkOut: "2026-10-25",
    ...overrides,
  };
}

export function makeTransportation(overrides: Partial<Transportation> = {}): Transportation {
  return {
    id: "leg-outbound",
    type: "flight",
    category: "outbound",
    fromCity: "Madrid",
    toCity: "Budapest",
    departureTime: "2026-10-23T00:00:00Z",
    ...overrides,
  };
}

export function makeTrip(overrides: Partial<Trip> = {}): Trip {
  return {
    id: "trip-test",
    title: "3 days in Budapest",
    description: "",
    phase: "upcoming",
    city: {
      slug: "budapest",
      name: "Budapest",
      country: "Hungary",
      countryCode: "HU",
      coordinates: budapest,
    },
    origin: "Madrid",
    dates: { startDate: "2026-10-23", endDate: "2026-10-25", durationDays: 3 },
    travellers: { adults: 2, children: 0, infants: 0 },
    budgetTier: 2,
    interests: ["food", "thermal_baths", "history"],
    pace: "balanced",
    imageUrl: "/images/budapest.jpg",
    itinerary: [makeItineraryDay()],
    stay: makeAccommodation(),
    legs: [makeTransportation()],
    createdAt: "2026-09-01T00:00:00Z",
    updatedAt: "2026-09-02T00:00:00Z",
    ...overrides,
  };
}

export function makeTripSummary(overrides: Partial<TripSummary> = {}): TripSummary {
  return {
    id: "trip-test",
    title: "3 days in Budapest",
    city: "Budapest",
    countryCode: "HU",
    startDate: "2026-10-23",
    endDate: "2026-10-25",
    phase: "upcoming",
    imageUrl: "/images/budapest.jpg",
    days: 3,
    stops: 9,
    ...overrides,
  };
}
