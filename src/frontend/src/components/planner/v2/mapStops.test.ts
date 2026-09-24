import { describe, expect, it } from "vitest";
import { EMPTY_ITINERARY, applyItineraryOps } from "@/hooks/plannerReducer";
import {
  ACTIVITIES,
  BATHS,
  EXTRAS,
  FIRST_ITINERARY_OPS,
  HOTELS,
  RESTAURANTS,
} from "@/data/planner-demo/session";
import type { ItineraryOp, OptionCard } from "@/types/planner";
import type { OptionGroupState } from "@/hooks/plannerReducer";
import { boundsOf, lineOf, stayStopId, stopId, toMapStops, toOptionMarks } from "./mapStops";

const itinerary = applyItineraryOps(EMPTY_ITINERARY, FIRST_ITINERARY_OPS);

/** The same card without coordinates: it must fall off the map entirely. */
const unlocated = (card: OptionCard): OptionCard => ({ ...card, lat: null, lon: null });

describe("toMapStops", () => {
  it("puts the stay first, unnumbered, and numbers the day's cards in slot order", () => {
    const stops = toMapStops(itinerary, 1);

    expect(stops.map((stop) => [stop.kind, stop.index, stop.title])).toEqual([
      ["stay", 0, HOTELS.rum.title],
      ["stop", 1, ACTIVITIES.greatMarket.title],
      ["stop", 2, EXTRAS.basilica.title],
      ["stop", 3, RESTAURANTS.menza.title],
      ["stop", 4, ACTIVITIES.danubeWalk.title],
    ]);
    expect(stops.map((stop) => stop.part)).toEqual([
      null,
      "morning",
      "afternoon",
      "evening",
      "night",
    ]);
  });

  it("gives every stop a stable id and the slot it belongs to", () => {
    const [stay, first] = toMapStops(itinerary, 2);

    expect(stay?.id).toBe(stayStopId(HOTELS.rum.id));
    expect(stay?.slot).toEqual({ day: 0, part: null });
    expect(first?.id).toBe(stopId(2, "morning", ACTIVITIES.fishermansBastion.id));
    expect(first?.slot).toEqual({ day: 2, part: "morning" });
  });

  it("maps only the selected day", () => {
    const titles = toMapStops(itinerary, 2).map((stop) => stop.title);

    expect(titles).toContain(BATHS.gellert.title);
    expect(titles).not.toContain(ACTIVITIES.greatMarket.title);
  });

  it("skips cards without coordinates, and numbers as if they were not there", () => {
    const patched = applyItineraryOps(itinerary, [
      {
        op: "put_activity",
        slot: { day: 1, part: "morning" },
        card: unlocated(ACTIVITIES.greatMarket),
      },
    ] satisfies ItineraryOp[]);

    const stops = toMapStops(patched, 1).filter((stop) => stop.kind === "stop");

    expect(stops.map((stop) => stop.title)).not.toContain(ACTIVITIES.greatMarket.title);
    expect(stops[0]).toMatchObject({ index: 1, title: EXTRAS.basilica.title });
  });

  it("maps nothing at all on the trip overview", () => {
    // `null` is the overview (TRA-177): no day on screen, no map column, so
    // not even the stay is a pin.
    expect(toMapStops(itinerary, null)).toEqual([]);
  });

  it("leaves out a stay without coordinates and returns nothing for an unknown day", () => {
    const patched = applyItineraryOps(itinerary, [
      { op: "set_stay", card: unlocated(HOTELS.rum) },
    ] satisfies ItineraryOp[]);

    expect(toMapStops(patched, 1).every((stop) => stop.kind === "stop")).toBe(true);
    expect(toMapStops(patched, 9)).toEqual([]);
  });
});

describe("boundsOf", () => {
  it("returns null without stops", () => {
    expect(boundsOf([])).toBeNull();
  });

  it("returns [[minLon, minLat], [maxLon, maxLat]] over every stop", () => {
    const stops = toMapStops(itinerary, 1);
    const lons = stops.map((stop) => stop.lon);
    const lats = stops.map((stop) => stop.lat);

    expect(boundsOf(stops)).toEqual([
      [Math.min(...lons), Math.min(...lats)],
      [Math.max(...lons), Math.max(...lats)],
    ]);
  });

  it("gives a single stop a degenerate box", () => {
    const [stay] = toMapStops(itinerary, 9);
    expect(stay).toBeDefined();
    expect(boundsOf([stay!])).toEqual([
      [stay!.lon, stay!.lat],
      [stay!.lon, stay!.lat],
    ]);
  });
});

describe("lineOf", () => {
  it("joins the stops in order, longitude first", () => {
    const stops = toMapStops(itinerary, 1);
    const line = lineOf(stops);

    expect(line?.geometry.coordinates).toEqual(stops.map((stop) => [stop.lon, stop.lat]));
  });

  it("draws nothing with fewer than two stops", () => {
    expect(lineOf([])).toBeNull();
    expect(lineOf(toMapStops(itinerary, 9))).toBeNull();
  });
});

describe("toOptionMarks", () => {
  const group = (id: string, kind: OptionGroupState["kind"], cards: OptionCard[]): OptionGroupState => ({
    group_id: id,
    kind,
    prompt: "Pick one",
    selection: "single",
    slot: null,
    cards,
    selectedIds: [],
    dismissedIds: [],
  });
  const baths = Object.values(BATHS);

  it("marks the newest question still waiting, card by card, where it has coordinates", () => {
    const groups = {
      old: group("old", "hotel", Object.values(HOTELS)),
      new: group("new", "experience", [...baths, unlocated(baths[0] as OptionCard)]),
    };
    const marks = toOptionMarks(groups, ["old", "new"]);
    expect(marks.map((mark) => mark.title)).toEqual(baths.map((card) => card.title));
    expect(marks[0]?.id).toBe(`option:new:${baths[0]?.id}`);
  });

  it("leaves out the cards waved away, and questions that are not places", () => {
    const waved = { ...group("g", "experience", baths), dismissedIds: [baths[0]?.id ?? ""] };
    expect(toOptionMarks({ g: waved }, ["g"])).toHaveLength(baths.length - 1);
    expect(toOptionMarks({ f: group("f", "flight", baths) }, ["f"])).toEqual([]);
    expect(toOptionMarks({}, [])).toEqual([]);
  });
});
