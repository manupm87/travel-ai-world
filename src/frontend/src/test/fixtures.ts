import type {
  Accommodation,
  Activity,
  Destination,
  ItineraryDay,
  Meal,
  Transportation,
  Trip,
} from "@/types/trip";
import type { TripSummary } from "@/types/trip-summary";

/**
 * Typed fixture builders. Every builder returns a complete, valid object so
 * tests never need `as unknown as Trip`; pass only the fields that matter.
 */

const paris = { lat: 48.8566, lng: 2.3522 };

export function makeDestination(overrides: Partial<Destination> = {}): Destination {
  return {
    id: "dest-paris",
    city: "Paris",
    country: "France",
    countryCode: "FR",
    coordinates: paris,
    arrivalDate: "2026-05-15",
    departureDate: "2026-05-18",
    nightsStaying: 3,
    ...overrides,
  };
}

export function makeActivity(overrides: Partial<Activity> = {}): Activity {
  return {
    id: "act-louvre",
    time: "10:00",
    duration: 180,
    title: "Louvre Museum",
    description: "Skip-the-line entry and the highlights tour.",
    location: { name: "Louvre", address: "Rue de Rivoli", city: "Paris", coordinates: paris },
    category: "culture",
    cost: 22,
    bookingRequired: true,
    rating: 4.7,
    ...overrides,
  };
}

export function makeMeal(overrides: Partial<Meal> = {}): Meal {
  return {
    id: "meal-bistro",
    time: "13:00",
    type: "lunch",
    restaurantName: "Le Petit Bistro",
    cuisine: "French",
    location: { name: "Le Petit Bistro", address: "Rue Cler", city: "Paris", coordinates: paris },
    estimatedCost: 35,
    ...overrides,
  };
}

export function makeItineraryDay(overrides: Partial<ItineraryDay> = {}): ItineraryDay {
  return {
    dayNumber: 1,
    date: "2026-05-15",
    destinationId: "dest-paris",
    title: "Arrival in Paris",
    description: "Settle in and take an evening walk along the Seine.",
    activities: [],
    meals: [],
    estimatedCost: 0,
    ...overrides,
  };
}

export function makeAccommodation(overrides: Partial<Accommodation> = {}): Accommodation {
  return {
    id: "acc-hotel",
    checkIn: "2026-05-15",
    checkOut: "2026-05-18",
    name: "Hotel Lumiere",
    type: "hotel",
    city: "Paris",
    countryCode: "FR",
    address: "12 Rue Saint-Honore",
    coordinates: paris,
    rating: 4.5,
    pricePerNight: 180,
    totalCost: 540,
    amenities: ["wifi"],
    checkInTime: "15:00",
    checkOutTime: "11:00",
    ...overrides,
  };
}

export function makeTransportation(overrides: Partial<Transportation> = {}): Transportation {
  return {
    id: "trans-train",
    type: "train",
    category: "ground",
    from: "Gare du Nord",
    to: "Bruxelles-Midi",
    fromCity: "Paris",
    toCity: "Brussels",
    departureTime: "10:00",
    arrivalTime: "11:30",
    provider: "Thalys",
    duration: 90,
    cost: 60,
    ...overrides,
  };
}

export function makeTrip(overrides: Partial<Trip> = {}): Trip {
  return {
    id: "trip-test",
    userId: "user-test",
    status: "planned",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-02T00:00:00Z",
    title: "Paris Escape",
    description: "Three days of art, food and long walks.",
    destinations: [makeDestination()],
    dates: { startDate: "2026-05-15", endDate: "2026-05-18", durationDays: 3 },
    travelers: { adults: 2, children: 0, infants: 0 },
    budget: {
      total: 1500,
      currency: "EUR",
      breakdown: { accommodation: 540, food: 400, activities: 300, transportation: 200, other: 60 },
    },
    preferences: { travelStyle: ["culture"], pacePreference: "relaxed", accommodationType: "hotel" },
    itinerary: [makeItineraryDay()],
    accommodation: [makeAccommodation()],
    transportation: [makeTransportation()],
    aiInsights: { weatherForecast: "Mild and sunny.", localTips: ["Book museums ahead."] },
    ...overrides,
  };
}

export function makeTripSummary(overrides: Partial<TripSummary> = {}): TripSummary {
  return {
    id: "trip-test",
    title: "Paris Escape",
    destinations: ["Paris"],
    startDate: "2026-05-15",
    endDate: "2026-05-18",
    status: "planned",
    imageUrl: "/images/paris.jpg",
    ...overrides,
  };
}
