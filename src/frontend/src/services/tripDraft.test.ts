import { describe, expect, it } from "vitest";

import {
  ACTIVITIES,
  BRIEF_COMPLETE,
  EXTRAS,
  FIRST_ITINERARY_OPS,
  HOTELS,
  MORE,
  RESTAURANTS,
} from "@/data/planner-demo/session";
import { applyItineraryOps, EMPTY_ITINERARY } from "@/hooks/plannerReducer";
import budapest from "@/test/fixtures/trip-budapest";
import type { ItineraryOp } from "@/types/planner";

import { toTrip } from "./trips";
import { isOptionCard, partFromTime, tripToBrief, tripToDraft } from "./tripDraft";

/**
 * The draft the fixture was saved from: the recorded session's first
 * itinerary, without the pieces a trip does not store — the weather forecast,
 * the flight search link and the warnings the model wrote for one turn.
 */
const KEPT_OPS = FIRST_ITINERARY_OPS.filter(
  (op) => op.op !== "set_weather" && op.op !== "warn"
).map((op) =>
  op.op === "set_route" ? ({ ...op, deep_link: null } satisfies ItineraryOp) : op
);

const draftItinerary = applyItineraryOps(EMPTY_ITINERARY, KEPT_OPS);

describe("tripToDraft", () => {
  it("rebuilds the very itinerary the trip was saved from", () => {
    const { draft, tripId } = tripToDraft(toTrip(budapest));

    expect(tripId).toBe(budapest.id);
    expect(draft.itinerary).toEqual(draftItinerary);
  });

  it("rebuilds the brief, so the next turn carries on where the trip left off", () => {
    const { draft } = tripToDraft(toTrip(budapest));

    expect(draft.brief).toEqual(BRIEF_COMPLETE);
    expect(draft.missing).toEqual([]);
  });

  it("starts with an empty conversation: core_api stores the trip, not the chat", () => {
    const { draft } = tripToDraft(toTrip(budapest));

    expect(draft.messages).toEqual([]);
    expect(draft.groups).toEqual({});
    expect(draft.shortlist).toEqual([]);
  });

  it("puts every card back where it was, meals included", () => {
    const { draft } = tripToDraft(toTrip(budapest));
    const [one, two, three] = draft.itinerary.days;

    expect(draft.itinerary.stay?.id).toBe(HOTELS.rum.id);
    expect(one?.slots.morning[0]?.id).toBe(ACTIVITIES.greatMarket.id);
    expect(one?.slots.afternoon[0]?.id).toBe(EXTRAS.basilica.id);
    expect(one?.slots.evening[0]?.id).toBe(RESTAURANTS.menza.id);
    expect(two?.slots.night[0]?.title).toBe(ACTIVITIES.szimpla.title);
    expect(three?.slots.night[0]?.id).toBe(MORE.mazelTov.id);
  });

  it("reads the route off the two legs and forgets the one-off flight search", () => {
    const { draft } = tripToDraft(toTrip(budapest));

    expect(draft.itinerary.route).toEqual({
      origin: "Madrid",
      destination: "Budapest",
      outbound_date: "2026-10-23",
      return_date: "2026-10-25",
      deep_link: null,
    });
  });

  it("builds a card from the columns when the trip carries none", () => {
    const trip = toTrip({
      ...budapest,
      accommodations: [
        {
          id: "acc-1",
          trip_id: budapest.id,
          name: "Pension Anna",
          source_ref: "osm:node/1",
          card: null,
          lat: 47.5,
          lng: 19.06,
        },
      ],
      itinerary_days: [
        {
          id: "day-1",
          trip_id: budapest.id,
          day_number: 1,
          title: "A day",
          activities: [
            {
              id: "act-1",
              itinerary_day_id: "day-1",
              title: "A walk",
              description: "Along the river",
              category: "do",
              booking_required: false,
              // Saved before `part_of_day` existed: the hour decides.
              time: "15:00",
              location_lat: 47.49,
              location_lng: 19.04,
            },
          ],
          meals: [],
        },
      ],
    });

    const { draft } = tripToDraft(trip);

    expect(draft.itinerary.stay).toMatchObject({
      id: "osm:node/1",
      title: "Pension Anna",
      category: "sleep",
      lat: 47.5,
      lon: 19.06,
      image_url: null,
      source: "",
      license: "",
    });
    expect(draft.itinerary.days[0]?.slots.afternoon[0]).toMatchObject({
      id: "act-1",
      title: "A walk",
      category: "do",
      why: "Along the river",
    });
  });

  it("leaves a trip with no route and no stay alone", () => {
    const { draft } = tripToDraft(
      toTrip({ ...budapest, transportations: [], accommodations: [] })
    );

    expect(draft.itinerary.route).toBeNull();
    expect(draft.itinerary.stay).toBeNull();
  });
});

describe("tripToBrief", () => {
  it("counts nights from the dates and drops a pace the brief never had", () => {
    const trip = toTrip({ ...budapest, pace_preference: "sprinting", budget_tier: 9 });

    expect(tripToBrief(trip)).toMatchObject({ nights: 2, pace: null, budget_tier: null });
  });

  it("leaves the nights unknown when the trip has no dates", () => {
    const trip = toTrip({
      ...budapest,
      start_date: null,
      end_date: null,
      duration_days: null,
    });

    expect(tripToBrief(trip)).toMatchObject({ nights: null, start_date: null, end_date: null });
  });
});

describe("partFromTime", () => {
  it("reads the part of the day the planner wrote that hour for", () => {
    expect(partFromTime("10:00")).toBe("morning");
    expect(partFromTime("15:00")).toBe("afternoon");
    expect(partFromTime("19:00")).toBe("evening");
    expect(partFromTime("22:00")).toBe("night");
  });

  it("falls back to the morning for an hour it cannot read", () => {
    expect(partFromTime("")).toBe("morning");
    expect(partFromTime("noon")).toBe("morning");
  });
});

describe("isOptionCard", () => {
  it("accepts what the planner stored and refuses anything else", () => {
    expect(isOptionCard({ ...HOTELS.rum })).toBe(true);
    expect(isOptionCard({ id: "x" })).toBe(false);
    expect(isOptionCard(null)).toBe(false);
    expect(isOptionCard("card")).toBe(false);
  });
});
