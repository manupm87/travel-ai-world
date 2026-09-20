import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ACTIVITIES, BATHS, BRIEF_COMPLETE, HOTELS, RESTAURANTS } from "@/data/planner-demo/session";
import { applyItineraryOps, EMPTY_ITINERARY } from "@/hooks/plannerReducer";
import budapest from "@/test/fixtures/trip-budapest";
import { BUDAPEST } from "@/test/fixtures/planner-city";

import { ApiError, UnauthorizedError } from "./http";
import { clearSession, writeSession } from "./session";
import {
  createTrip,
  deleteTrip,
  getTrip,
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
  phase: "upcoming",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-02T00:00:00Z",
  title: "Bare trip",
  city_slug: "budapest",
  city: "Budapest",
  country: "Hungary",
  country_code: "HU",
  travelers_adults: 2,
  travelers_children: 0,
  travelers_infants: 0,
  itinerary_days: [],
  accommodations: [],
  transportations: [],
};

describe("toTrip", () => {
  it("maps a saved trip into the nested camelCase view model", () => {
    const trip = toTrip(budapest);

    expect(trip.id).toBe(budapest.id);
    expect(trip.phase).toBe("upcoming");
    expect(trip.city).toEqual({
      slug: "budapest",
      name: "Budapest",
      country: "Hungary",
      countryCode: "HU",
      coordinates: { lat: 47.4979, lng: 19.0402 },
    });
    expect(trip.origin).toBe("Madrid");
    expect(trip.budgetTier).toBe(2);
    expect(trip.dates).toEqual({ startDate: "2026-10-23", endDate: "2026-10-25", durationDays: 3 });
    expect(trip.travellers).toEqual({ adults: 2, children: 0, infants: 0 });
    expect(trip.itinerary).toHaveLength(3);
    expect(trip.stay?.name).toBe(HOTELS.rum.title);
    expect(trip.legs.map((leg) => leg.category)).toEqual(["outbound", "return"]);
  });

  it("keeps every card the planner saved, with its corpus id and part of the day", () => {
    const [first] = toTrip(budapest).itinerary;

    expect(first?.activities[0]).toMatchObject({
      sourceRef: ACTIVITIES.greatMarket.id,
      partOfDay: "morning",
      card: { id: ACTIVITIES.greatMarket.id, title: ACTIVITIES.greatMarket.title },
    });
    expect(first?.meals[0]).toMatchObject({
      sourceRef: RESTAURANTS.menza.id,
      partOfDay: "evening",
      restaurantName: RESTAURANTS.menza.title,
    });
  });

  it("fills every optional with a safe default instead of null", () => {
    const trip = toTrip(minimal);

    expect(trip.description).toBe("");
    expect(trip.origin).toBe("");
    expect(trip.budgetTier).toBeNull();
    expect(trip.dates).toEqual({ startDate: "", endDate: "", durationDays: 0 });
    expect(trip.city.coordinates).toEqual({ lat: null, lng: null });
    expect(trip.interests).toEqual([]);
    expect(trip.itinerary).toEqual([]);
    expect(trip.stay).toBeNull();
    expect(trip.legs).toEqual([]);
  });

  it("orders days by number and ignores a card that is not an object", () => {
    const trip = toTrip({
      ...minimal,
      itinerary_days: [
        { id: "d2", trip_id: "t1", day_number: 2, activities: [], meals: [] },
        {
          id: "d1",
          trip_id: "t1",
          day_number: 1,
          activities: [
            {
              id: "a1",
              itinerary_day_id: "d1",
              title: "A walk",
              booking_required: false,
              card: null,
            },
          ],
          meals: [],
        },
      ],
    });

    expect(trip.itinerary.map((d) => d.dayNumber)).toEqual([1, 2]);
    expect(trip.itinerary[0]?.activities[0]?.card).toBeNull();
  });
});

describe("toTripSummary", () => {
  it("keeps only what one card of the trips list needs", () => {
    expect(toTripSummary(budapest)).toEqual({
      id: budapest.id,
      title: "3 days in Budapest",
      city: "Budapest",
      countryCode: "HU",
      startDate: "2026-10-23",
      endDate: "2026-10-25",
      phase: "upcoming",
      imageUrl: HOTELS.rum.image_url,
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
      new Response(JSON.stringify([budapest, { ...minimal, id: "t2", title: "Second" }]), {
        status: 200,
      })
    );
    const controller = new AbortController();

    const summaries = await listTrips({ signal: controller.signal });

    expect(summaries).toEqual([
      toTripSummary(budapest),
      {
        id: "t2",
        title: "Second",
        city: "Budapest",
        countryCode: "HU",
        startDate: "",
        endDate: "",
        phase: "upcoming",
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
    fetchMock.mockResolvedValue(new Response(JSON.stringify(budapest), { status: 200 }));
    const controller = new AbortController();

    const trip = await getTrip(budapest.id, { signal: controller.signal });

    expect(trip).toEqual(toTrip(budapest));
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(new RegExp(`/api/v1/trips/${budapest.id}$`));
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
      city_slug: "budapest",
      city: "Budapest",
      country: "Hungary",
      country_code: "HU",
      travelers_adults: 2,
      travelers_children: 0,
      travelers_infants: 0,
    });

    expect(created.id).toBe("t1");
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/api\/v1\/trips\/$/);
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toMatchObject({ title: "Bare trip", city: "Budapest" });
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

  it("surfaces the lock core_api puts on a trip that is no longer upcoming", async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          detail: { message: "Trip is locked: it is ongoing or past", error_code: "TRIP_LOCKED" },
        }),
        { status: 409 }
      )
    );

    const err = await updateTrip("t1", { title: "Nope" }).catch((e: unknown) => e);

    expect(err).toMatchObject({ status: 409, code: "TRIP_LOCKED" });
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

  const save = (brief = BRIEF_COMPLETE, options = {}) =>
    saveDraftAsTrip(itinerary, brief, BUDAPEST, { title: "3 days in Budapest", ...options });

  it("writes the trip, then its children, one request at a time", async () => {
    const trip = await save();

    expect(calls).toEqual([
      "POST /trips/",
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

  it("writes the city from the planner's own city, and the brief onto the trip", async () => {
    await save();

    expect(bodies[0]).toMatchObject({
      title: "3 days in Budapest",
      city_slug: "budapest",
      city: "Budapest",
      country: "Hungary",
      country_code: "HU",
      lat: 47.4979,
      lng: 19.0402,
      origin: "Madrid",
      budget_tier: 2,
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
    expect(bodies[0]).not.toHaveProperty("status");
  });

  it("dates every day and gives each card its part of the day, its id and the card itself", async () => {
    await save();

    expect(bodies[1]).toMatchObject({ day_number: 1, date: "2026-10-23" });
    expect(bodies[1]).not.toHaveProperty("destination_id");
    expect(bodies[2]).toMatchObject({
      title: ACTIVITIES.greatMarket.title,
      description: ACTIVITIES.greatMarket.why,
      category: "buy",
      part_of_day: "morning",
      time: "10:00",
      source_ref: ACTIVITIES.greatMarket.id,
      card: { ...ACTIVITIES.greatMarket },
      location_lat: ACTIVITIES.greatMarket.lat,
      location_city: "Budapest",
    });
    expect(bodies[4]).toMatchObject({ day_number: 2, date: "2026-10-24" });
    expect(bodies[5]).toMatchObject({
      title: BATHS.szechenyi.title,
      part_of_day: "afternoon",
      time: "15:00",
    });
  });

  it("saves a restaurant as the meal of its part of the day, not an activity", async () => {
    await save();

    expect(calls[3]).toBe("POST /trips/t1/itinerary-days/day1/meals/");
    expect(bodies[3]).toMatchObject({
      restaurant_name: RESTAURANTS.menza.title,
      type: "dinner",
      cuisine: RESTAURANTS.menza.subtitle,
      part_of_day: "evening",
      time: "19:00",
      source_ref: RESTAURANTS.menza.id,
      card: { ...RESTAURANTS.menza },
    });
  });

  it("saves the stay with its card, and the route's two legs", async () => {
    await save();

    expect(bodies[6]).toMatchObject({
      name: HOTELS.rum.title,
      type: "hotel",
      city: "Budapest",
      country_code: "HU",
      source_ref: HOTELS.rum.id,
      card: { ...HOTELS.rum },
      check_in: "2026-10-23",
      check_out: "2026-10-25",
    });
    expect(bodies[7]).toMatchObject({
      category: "outbound",
      from_city: "Madrid",
      to_city: "Budapest",
      departure_time: "2026-10-23T00:00:00Z",
    });
    expect(bodies[8]).toMatchObject({ category: "return", from_city: "Budapest" });
  });

  it("rewrites the same trip when it already has one: patch, delete, recreate", async () => {
    const existing: TripResponse = {
      ...minimal,
      id: "t1",
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

    await save(BRIEF_COMPLETE, { tripId: "t1" });

    expect(calls.slice(0, 5)).toEqual([
      "PATCH /trips/t1",
      "DELETE /trips/t1/itinerary-days/old-day",
      "DELETE /trips/t1/accommodations/old-stay",
      "DELETE /trips/t1/transportations/old-leg",
      "POST /trips/t1/itinerary-days/",
    ]);
    expect(calls).not.toContain("POST /trips/");
    expect(concurrent).toBe(1);
  });

  it("falls back to the days it has when the brief carries no dates", async () => {
    await save({ ...BRIEF_COMPLETE, start_date: null, end_date: null });

    expect(bodies[0]).toMatchObject({ duration_days: 2, start_date: null });
    expect(bodies[1]).toMatchObject({ day_number: 1, date: null });
  });
});
