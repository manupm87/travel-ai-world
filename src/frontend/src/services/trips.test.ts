import { describe, expect, it } from "vitest";

import japan from "@/mocks/trip-japan";

import {
  getAllTripIds,
  getTripById,
  getTripSummaries,
  itineraryDayKind,
  toTrip,
  toTripSummary,
  type TripResponse,
} from "./trips";

/** The smallest valid backend answer: every optional field absent. */
const minimal: TripResponse = {
  id: "t1",
  user_id: 7,
  status: "planning",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-02T00:00:00Z",
  title: "Bare trip",
  travelers_adults: 2,
  travelers_children: 0,
  travelers_infants: 0,
  destinations: [],
  itinerary_days: [],
  accommodations: [],
  transportations: [],
};

describe("toTrip", () => {
  it("maps a full backend trip into the nested camelCase view model", () => {
    const trip = toTrip(japan);

    expect(trip.id).toBe("trip_japan_2026");
    expect(trip.status).toBe("planning");
    expect(trip.dates).toEqual({ startDate: "2026-10-01", endDate: "2026-10-14", durationDays: 14 });
    expect(trip.travelers.adults + trip.travelers.children + trip.travelers.infants).toBe(2);
    expect(trip.budget.currency).toBe("USD");
    expect(trip.budget.breakdown.food).toBeTypeOf("number");
    expect(trip.destinations[0]?.coordinates).toEqual({ lat: 35.6762, lng: 139.6503 });
    expect(trip.itinerary[0]?.activities[0]?.location.city).toBe("Tokyo");
    expect(trip.transportation[0]?.departureTime).toMatch(/^2026-/);
    expect(trip.aiInsights?.localTips).toBeInstanceOf(Array);
  });

  it("fills every optional with a safe default instead of null", () => {
    const trip = toTrip(minimal);

    expect(trip.userId).toBe("7");
    expect(trip.description).toBe("");
    expect(trip.dates).toEqual({ startDate: "", endDate: "", durationDays: 0 });
    expect(trip.budget).toEqual({
      total: 0,
      currency: "",
      breakdown: { accommodation: 0, food: 0, activities: 0, transportation: 0, other: 0 },
    });
    expect(trip.preferences.travelStyle).toEqual([]);
    expect(trip.itinerary).toEqual([]);
    expect(trip.aiInsights).toBeUndefined();
  });

  it("parses decimal strings as numbers and orders days by number", () => {
    const trip = toTrip({
      ...minimal,
      budget_total: "1234.50",
      itinerary_days: [
        { id: "d2", trip_id: "t1", day_number: 2, activities: [], meals: [] },
        { id: "d1", trip_id: "t1", day_number: 1, estimated_cost: "10.00", activities: [], meals: [] },
      ],
    });

    expect(trip.budget.total).toBe(1234.5);
    expect(trip.itinerary.map((d) => d.dayNumber)).toEqual([1, 2]);
    expect(trip.itinerary[0]?.estimatedCost).toBe(10);
  });

  it("exposes AI insights only when the backend sent some", () => {
    expect(toTrip({ ...minimal, ai_local_tips: ["Carry cash"] }).aiInsights).toEqual({
      weatherForecast: "",
      localTips: ["Carry cash"],
    });
    expect(toTrip({ ...minimal, ai_weather_forecast: "Sunny" }).aiInsights?.weatherForecast).toBe("Sunny");
  });
});

describe("itineraryDayKind", () => {
  it("reads free days from the title in either language", () => {
    expect(itineraryDayKind("Free Day in Kyoto", [])).toBe("free");
    expect(itineraryDayKind("Día libre", [{ category: "transport" }])).toBe("free");
  });

  it("marks travel days by their activities, otherwise regular", () => {
    expect(itineraryDayKind("Paris → Rome", [{ category: "transport" }])).toBe("travel");
    expect(itineraryDayKind("Museums", [{ category: "culture" }])).toBe("regular");
    expect(itineraryDayKind(null, [])).toBe("regular");
  });
});

describe("toTripSummary", () => {
  it("keeps only what a dashboard card needs", () => {
    expect(toTripSummary(japan)).toEqual({
      id: "trip_japan_2026",
      title: "Japan Explorer: Traditions & Neon",
      destinations: ["Tokyo", "Kyoto", "Osaka"],
      startDate: "2026-10-01",
      endDate: "2026-10-14",
      status: "planning",
      imageUrl: expect.stringContaining("https://"),
    });
  });
});

describe("fixtures-backed service", () => {
  it("lists the prerendered ids", () => {
    expect(getAllTripIds()).toContain("trip_euro_2026");
  });

  it("returns null for an unknown id and a mapped trip for a known one", async () => {
    expect(await getTripById("unknown_trip_id")).toBeNull();
    const trip = await getTripById("trip_euro_2026");
    expect(trip?.title).toBeDefined();
    // The legs that used to carry `departure`/`arrival` (a fixture bug) now map like the rest.
    const timed = trip?.transportation.filter((tr) => tr.type !== "metro") ?? [];
    expect(timed.length).toBeGreaterThan(0);
    expect(timed.every((tr) => /^\d{4}-\d{2}-\d{2}T/.test(tr.departureTime))).toBe(true);
  });

  it("derives the summaries from the same fixtures", async () => {
    const summaries = await getTripSummaries();
    expect(summaries.map((s) => s.id).sort()).toEqual(getAllTripIds().sort());
    expect(summaries.every((s) => s.imageUrl.startsWith("https://"))).toBe(true);
  });
});
