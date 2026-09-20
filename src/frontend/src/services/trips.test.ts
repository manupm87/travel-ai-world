import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ACTIVITIES, BATHS, BRIEF_COMPLETE, HOTELS, RESTAURANTS } from "@/data/planner-demo/session";
import { applyItineraryOps, EMPTY_ITINERARY } from "@/hooks/plannerReducer";
import japan from "@/test/fixtures/trip-japan";

import { ApiError, UnauthorizedError } from "./http";
import { clearSession, writeSession } from "./session";
import {
  countryOf,
  createTrip,
  deleteTrip,
  getTrip,
  itineraryDayKind,
  listTrips,
  saveDraftAsTrip,
  toTrip,
  toTripSummary,
  updateTrip,
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

describe("listTrips", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    writeSession("tok", { id: "1", email: "a@b.c", name: "A" });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    clearSession();
  });

  it("asks core_api with the bearer token and maps the DTOs to summaries", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify([japan, { ...minimal, id: "t2", title: "Second" }]), {
        status: 200,
      })
    );
    const controller = new AbortController();

    const summaries = await listTrips({ signal: controller.signal });

    expect(summaries).toEqual([
      toTripSummary(japan),
      {
        id: "t2",
        title: "Second",
        destinations: [],
        startDate: "",
        endDate: "",
        status: "planning",
        imageUrl: "",
      },
    ]);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/api\/v1\/trips\/\?limit=100$/);
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer tok");
    expect(init.signal).toBe(controller.signal);
  });

  it("turns a non-2xx answer into an ApiError carrying the backend's error_code", async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({ detail: { message: "Database down", error_code: "DB_UNAVAILABLE" } }),
        { status: 503 }
      )
    );

    const err = await listTrips().catch((e: unknown) => e);

    expect(err).toBeInstanceOf(ApiError);
    expect(err).not.toBeInstanceOf(UnauthorizedError);
    expect(err).toMatchObject({ status: 503, code: "DB_UNAVAILABLE", message: "Database down" });
  });

  it("throws UnauthorizedError on 401", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ detail: "expired" }), { status: 401 })
    );

    await expect(listTrips()).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it("throws UnauthorizedError without a token and never touches the network", async () => {
    clearSession();

    await expect(listTrips()).rejects.toBeInstanceOf(UnauthorizedError);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("getTrip", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    writeSession("tok", { id: "1", email: "a@b.c", name: "A" });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    clearSession();
  });

  it("asks core_api for the id with the bearer token and maps the DTO to the view model", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify(japan), { status: 200 }));
    const controller = new AbortController();

    const trip = await getTrip("trip_japan_2026", { signal: controller.signal });

    expect(trip).toEqual(toTrip(japan));
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/api\/v1\/trips\/trip_japan_2026$/);
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer tok");
    expect(init.signal).toBe(controller.signal);
  });

  it("URL-encodes the id", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify(minimal), { status: 200 }));

    await getTrip("a/b?c");

    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toMatch(/\/api\/v1\/trips\/a%2Fb%3Fc$/);
  });

  it("resolves null on 404 (no such trip)", async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({ detail: { message: "Trip not found", error_code: "ENTITY_NOT_FOUND" } }),
        { status: 404 }
      )
    );

    await expect(getTrip("00000000-0000-0000-0000-000000000000")).resolves.toBeNull();
  });

  it("resolves null on 403 (someone else's trip) so the UI cannot tell it apart", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ detail: { message: "Forbidden", error_code: "FORBIDDEN" } }), {
        status: 403,
      })
    );

    await expect(getTrip("t1")).resolves.toBeNull();
  });

  it("rethrows any other failure as an ApiError", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ detail: "Internal Server Error" }), { status: 500 })
    );

    const err = await getTrip("t1").catch((e: unknown) => e);

    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 500 });
  });

  it("throws UnauthorizedError on 401", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ detail: "expired" }), { status: 401 }));

    await expect(getTrip("t1")).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it("throws UnauthorizedError without a token and never touches the network", async () => {
    clearSession();

    await expect(getTrip("t1")).rejects.toBeInstanceOf(UnauthorizedError);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("createTrip, updateTrip and deleteTrip", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    writeSession("tok", { id: "1", email: "a@b.c", name: "A" });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    clearSession();
  });

  it("posts a trip and resolves with what the backend stored", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify(minimal), { status: 201 }));

    const created = await createTrip({
      title: "Bare trip",
      status: "planning",
      travelers_adults: 2,
      travelers_children: 0,
      travelers_infants: 0,
    });

    expect(created.id).toBe("t1");
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/api\/v1\/trips\/$/);
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toMatchObject({ title: "Bare trip" });
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer tok");
  });

  it("patches only the fields it is given", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ ...minimal, title: "Renamed" }), { status: 200 })
    );

    const updated = await updateTrip("t 1", { title: "Renamed" });

    expect(updated.title).toBe("Renamed");
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/api\/v1\/trips\/t%201$/);
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(String(init.body))).toEqual({ title: "Renamed" });
  });

  it("deletes a trip and tolerates the empty 204 body", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));

    await expect(deleteTrip("t1")).resolves.toBeUndefined();

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/api\/v1\/trips\/t1$/);
    expect(init.method).toBe("DELETE");
  });

  it("turns a refused delete into an ApiError", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ detail: { message: "Not yours", error_code: "FORBIDDEN" } }), {
        status: 403,
      })
    );

    const err = await deleteTrip("t1").catch((e: unknown) => e);

    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 403, code: "FORBIDDEN" });
  });
});

describe("countryOf", () => {
  it("knows the cities the planner covers, in either language", () => {
    expect(countryOf("Budapest")).toEqual({ country: "Hungary", code: "HU" });
    expect(countryOf(" bolonia ")).toEqual({ country: "Italy", code: "IT" });
  });

  it("keeps an unknown city's own name rather than inventing a country", () => {
    expect(countryOf("Ulaanbaatar")).toEqual({ country: "Ulaanbaatar", code: "EU" });
  });
});

describe("saveDraftAsTrip", () => {
  const itinerary = applyItineraryOps(EMPTY_ITINERARY, [
    { op: "set_stay", card: HOTELS.rum },
    { op: "put_activity", slot: { day: 1, part: "morning" }, card: ACTIVITIES.greatMarket },
    { op: "put_activity", slot: { day: 1, part: "evening" }, card: RESTAURANTS.menza },
    { op: "put_activity", slot: { day: 2, part: "afternoon" }, card: BATHS.szechenyi },
    {
      op: "set_route",
      origin: "Madrid",
      destination: "Budapest",
      outbound_date: "2026-10-23",
      return_date: "2026-10-25",
      deep_link: null,
    },
  ]);

  const fetchMock = vi.fn();
  /** Every request as `METHOD /path`, in the order it was made. */
  let calls: string[];
  /** The bodies of those same requests, by index. */
  let bodies: unknown[];
  /** How many requests were ever in flight at the same time. */
  let concurrent: number;

  /** The trip the final read answers with; enough for `toTrip`. */
  const saved: TripResponse = { ...minimal, id: "t1", title: "3 days in Budapest" };

  /** What core_api answers: an id for every POST, nothing for a DELETE. */
  function answer(url: string, method: string): Response {
    if (method === "DELETE") return new Response(null, { status: 204 });
    if (url.includes("/itinerary-days/") && !url.endsWith("/itinerary-days/")) {
      return new Response(JSON.stringify({ id: "child" }), { status: 201 });
    }
    if (url.endsWith("/itinerary-days/")) {
      const day = calls.filter((c) => c.endsWith("/itinerary-days/")).length + 1;
      return new Response(JSON.stringify({ id: `day${day}` }), { status: 201 });
    }
    if (url.endsWith("/destinations/")) {
      return new Response(JSON.stringify({ id: "dest1" }), { status: 201 });
    }
    return new Response(JSON.stringify(saved), { status: 200 });
  }

  beforeEach(() => {
    calls = [];
    bodies = [];
    concurrent = 0;
    let inFlight = 0;
    fetchMock.mockReset();
    fetchMock.mockImplementation(async (url: string, init: RequestInit) => {
      const method = init.method ?? "GET";
      const path = new URL(url, "http://api.test").pathname.replace("/api/v1", "");
      inFlight += 1;
      concurrent = Math.max(concurrent, inFlight);
      const response = answer(url, method);
      calls.push(`${method} ${path}`);
      bodies.push(init.body ? JSON.parse(String(init.body)) : null);
      await Promise.resolve();
      inFlight -= 1;
      return response;
    });
    vi.stubGlobal("fetch", fetchMock);
    writeSession("tok", { id: "1", email: "a@b.c", name: "A" });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    clearSession();
  });

  it("writes the trip, then its children, one request at a time", async () => {
    const trip = await saveDraftAsTrip(itinerary, BRIEF_COMPLETE, {
      title: "3 days in Budapest",
    });

    expect(calls).toEqual([
      "POST /trips/",
      "POST /trips/t1/destinations/",
      "POST /trips/t1/itinerary-days/",
      "POST /trips/t1/itinerary-days/day1/activities/",
      "POST /trips/t1/itinerary-days/day1/meals/",
      "POST /trips/t1/itinerary-days/",
      "POST /trips/t1/itinerary-days/day2/activities/",
      "POST /trips/t1/accommodations/",
      "POST /trips/t1/transportations/",
      "POST /trips/t1/transportations/",
      "GET /trips/t1",
    ]);
    // Never `Promise.all` on one trip: the day's id is only known once the
    // day is written, and core_api sees one write at a time.
    expect(concurrent).toBe(1);
    expect(trip.id).toBe("t1");
  });

  it("maps the brief onto the trip and the draft's cover onto its photo", async () => {
    await saveDraftAsTrip(itinerary, BRIEF_COMPLETE, { title: "3 days in Budapest" });

    expect(bodies[0]).toMatchObject({
      title: "3 days in Budapest",
      status: "planning",
      start_date: "2026-10-23",
      end_date: "2026-10-25",
      duration_days: 3,
      travelers_adults: 2,
      travelers_children: 0,
      travel_style: ["food", "thermal_baths", "history"],
      pace_preference: "balanced",
      budget_currency: "EUR",
      image_url: HOTELS.rum.image_url,
    });
  });

  it("names the destination's country and places it on the map", async () => {
    await saveDraftAsTrip(itinerary, BRIEF_COMPLETE, { title: "3 days in Budapest" });

    expect(bodies[1]).toMatchObject({
      city: "Budapest",
      country: "Hungary",
      country_code: "HU",
      arrival_date: "2026-10-23",
      departure_date: "2026-10-25",
      nights_staying: 2,
      lat: HOTELS.rum.lat,
      lng: HOTELS.rum.lon,
    });
  });

  it("dates every day and gives each card the hour its part of the day reads as", async () => {
    await saveDraftAsTrip(itinerary, BRIEF_COMPLETE, { title: "3 days in Budapest" });

    expect(bodies[2]).toMatchObject({ day_number: 1, date: "2026-10-23", destination_id: "dest1" });
    expect(bodies[3]).toMatchObject({
      title: ACTIVITIES.greatMarket.title,
      description: ACTIVITIES.greatMarket.why,
      category: "buy",
      time: "10:00",
      location_lat: ACTIVITIES.greatMarket.lat,
      location_city: "Budapest",
    });
    expect(bodies[5]).toMatchObject({ day_number: 2, date: "2026-10-24" });
    expect(bodies[6]).toMatchObject({ title: BATHS.szechenyi.title, time: "15:00" });
  });

  it("saves a restaurant as the meal of its part of the day, not an activity", async () => {
    await saveDraftAsTrip(itinerary, BRIEF_COMPLETE, { title: "3 days in Budapest" });

    expect(calls[4]).toBe("POST /trips/t1/itinerary-days/day1/meals/");
    expect(bodies[4]).toMatchObject({
      restaurant_name: RESTAURANTS.menza.title,
      type: "dinner",
      cuisine: RESTAURANTS.menza.subtitle,
      time: "19:00",
    });
  });

  it("saves the stay and the route's two legs", async () => {
    await saveDraftAsTrip(itinerary, BRIEF_COMPLETE, { title: "3 days in Budapest" });

    expect(bodies[7]).toMatchObject({
      name: HOTELS.rum.title,
      type: "hotel",
      city: "Budapest",
      country_code: "HU",
      check_in: "2026-10-23",
      check_out: "2026-10-25",
    });
    expect(bodies[8]).toMatchObject({
      category: "outbound",
      from_city: "Madrid",
      to_city: "Budapest",
      departure_time: "2026-10-23T00:00:00Z",
    });
    expect(bodies[9]).toMatchObject({ category: "return", from_city: "Budapest" });
  });

  it("rewrites the same trip when it already has one: patch, delete, recreate", async () => {
    const existing: TripResponse = {
      ...minimal,
      id: "t1",
      destinations: [{ id: "old-dest", trip_id: "t1", city: "Budapest", country: "Hungary", country_code: "HU" }],
      itinerary_days: [{ id: "old-day", trip_id: "t1", day_number: 1, activities: [], meals: [] }],
      accommodations: [{ id: "old-stay", trip_id: "t1", name: "Old hotel" }],
      transportations: [{ id: "old-leg", trip_id: "t1" }],
    };
    fetchMock.mockImplementationOnce(async (url: string, init: RequestInit) => {
      calls.push(`PATCH ${new URL(url, "http://api.test").pathname.replace("/api/v1", "")}`);
      bodies.push(JSON.parse(String(init.body)));
      await Promise.resolve();
      return new Response(JSON.stringify(existing), { status: 200 });
    });

    await saveDraftAsTrip(itinerary, BRIEF_COMPLETE, {
      title: "3 days in Budapest",
      tripId: "t1",
    });

    expect(calls.slice(0, 6)).toEqual([
      "PATCH /trips/t1",
      "DELETE /trips/t1/itinerary-days/old-day",
      "DELETE /trips/t1/destinations/old-dest",
      "DELETE /trips/t1/accommodations/old-stay",
      "DELETE /trips/t1/transportations/old-leg",
      "POST /trips/t1/destinations/",
    ]);
    expect(calls).not.toContain("POST /trips/");
    expect(concurrent).toBe(1);
  });

  it("falls back to the days it has when the brief carries no dates", async () => {
    await saveDraftAsTrip(itinerary, { ...BRIEF_COMPLETE, start_date: null, end_date: null }, {
      title: "Your trip",
    });

    expect(bodies[0]).toMatchObject({ duration_days: 2, start_date: null });
    expect(bodies[2]).toMatchObject({ day_number: 1, date: null });
  });
});
