import { describe, it, expect } from "vitest";
import {
  BATHS,
  BRIEF_COMPLETE,
  FIRST_ITINERARY_OPS,
  GROUP_IDS,
  HOTELS,
  NEIGHBOURHOODS,
} from "@/data/planner-demo/session";
import { BRIEF_FIELDS, EMPTY_BRIEF, type ItineraryOp, type Slot } from "@/types/planner";
import {
  applyItineraryOp,
  applyItineraryOps,
  computeMissing,
  EMPTY_ITINERARY,
  hasItinerary,
  initialPlannerState,
  partOf,
  plannerReducer,
  toHistory,
  toItinerarySnapshot,
  type OptionGroupState,
  type PlannerDraft,
  type PlannerMessage,
  type PlannerState,
} from "./plannerReducer";

// ─── applyItineraryOp(s) ────────────────────────────────────────────────────

describe("applyItineraryOps", () => {
  const itinerary = applyItineraryOps(EMPTY_ITINERARY, FIRST_ITINERARY_OPS);

  it("sorts the three days by day number", () => {
    expect(itinerary.days.map((d) => d.day)).toEqual([1, 2, 3]);
  });

  it("sets each day's title", () => {
    expect(itinerary.days.map((d) => d.title)).toEqual([
      "Arrival: Belváros and the Danube",
      "Buda: the castle and thermal baths",
      "Monumental Pest and the Jewish Quarter",
    ]);
  });

  it("sets each day's weather", () => {
    expect(itinerary.days.map((d) => d.weather?.summary)).toEqual([
      "Cloudy",
      "Sunny",
      "Rain",
    ]);
  });

  it("sets the stay from set_stay", () => {
    expect(itinerary.stay).toEqual(HOTELS.rum);
  });

  it("sets the route from set_route", () => {
    expect(itinerary.route).toEqual({
      origin: "Madrid",
      destination: "Budapest",
      outbound_date: "2026-10-23",
      return_date: "2026-10-25",
      deep_link: "https://www.google.com/travel/flights?q=Flights%20from%20MAD%20to%20BUD",
    });
  });

  it("carries the too_far warning for day 2's afternoon", () => {
    expect(itinerary.warnings).toEqual([
      {
        slot: { day: 2, part: "afternoon" },
        code: "too_far",
        message: "40 minutes on foot from the previous stop",
      },
    ]);
  });
});

describe("applyItineraryOp — put_activity", () => {
  it("is idempotent: the same card twice stays once", () => {
    const slot: Slot = { day: 2, part: "afternoon" };
    const once = applyItineraryOp(EMPTY_ITINERARY, { op: "put_activity", slot, card: BATHS.gellert });
    const twice = applyItineraryOp(once, { op: "put_activity", slot, card: BATHS.gellert });
    expect(twice.days[0]?.slots.afternoon).toHaveLength(1);
  });

  it("replaces the card object on a repeat put_activity for the same id", () => {
    const slot: Slot = { day: 2, part: "afternoon" };
    let itinerary = applyItineraryOp(EMPTY_ITINERARY, { op: "put_activity", slot, card: BATHS.gellert });
    const updated = { ...BATHS.gellert, title: "Gellért Baths (renamed)" };
    itinerary = applyItineraryOp(itinerary, { op: "put_activity", slot, card: updated });
    expect(itinerary.days[0]?.slots.afternoon).toEqual([updated]);
  });

  it("a slot with part: null lands in the morning", () => {
    const itinerary = applyItineraryOp(EMPTY_ITINERARY, {
      op: "put_activity",
      slot: { day: 1, part: null },
      card: BATHS.gellert,
    });
    expect(itinerary.days[0]?.slots.morning).toEqual([BATHS.gellert]);
  });
});

describe("applyItineraryOp — remove_activity", () => {
  it("removes the card and clears that slot's warnings", () => {
    const slot: Slot = { day: 2, part: "afternoon" };
    let itinerary = applyItineraryOp(EMPTY_ITINERARY, { op: "put_activity", slot, card: BATHS.gellert });
    itinerary = applyItineraryOp(itinerary, {
      op: "warn",
      slot,
      code: "too_far",
      message: "far",
    });
    itinerary = applyItineraryOp(itinerary, {
      op: "remove_activity",
      slot,
      card_id: BATHS.gellert.id,
    });
    expect(itinerary.days[0]?.slots.afternoon).toEqual([]);
    expect(itinerary.warnings).toEqual([]);
  });
});

describe("partOf", () => {
  it("defaults a null part to morning", () => {
    expect(partOf({ day: 1, part: null })).toBe("morning");
  });

  it("keeps an explicit part", () => {
    expect(partOf({ day: 1, part: "evening" })).toBe("evening");
  });
});

describe("applyItineraryOp — warn", () => {
  it("upserts by slot and code: a repeat replaces the message rather than adding a second warning", () => {
    const slot: Slot = { day: 2, part: "afternoon" };
    let itinerary = applyItineraryOp(EMPTY_ITINERARY, {
      op: "warn",
      slot,
      code: "too_far",
      message: "first",
    });
    itinerary = applyItineraryOp(itinerary, { op: "warn", slot, code: "too_far", message: "second" });
    expect(itinerary.warnings).toEqual([{ slot, code: "too_far", message: "second" }]);
  });
});

describe("applyItineraryOp — set_day_title", () => {
  it("creates the day when it does not exist yet", () => {
    const itinerary = applyItineraryOp(EMPTY_ITINERARY, {
      op: "set_day_title",
      day: 3,
      title: "New day",
    });
    expect(itinerary.days).toEqual([
      { day: 3, title: "New day", weather: null, slots: { morning: [], afternoon: [], evening: [], night: [] } },
    ]);
  });
});

describe("applyItineraryOp — unknown op", () => {
  it("is ignored, returning the itinerary unchanged", () => {
    const bogus = { op: "teleport" } as unknown as ItineraryOp;
    expect(applyItineraryOp(EMPTY_ITINERARY, bogus)).toBe(EMPTY_ITINERARY);
  });
});

// ─── toItinerarySnapshot ────────────────────────────────────────────────────

describe("toItinerarySnapshot", () => {
  it("maps the stay and every day's slots to card ids, keeping all four parts", () => {
    const itinerary = applyItineraryOps(EMPTY_ITINERARY, FIRST_ITINERARY_OPS);
    const snapshot = toItinerarySnapshot(itinerary);

    expect(snapshot.stay_card_id).toBe(HOTELS.rum.id);
    const day2 = snapshot.days.find((d) => d.day === 2);
    expect(day2?.slots.afternoon).toEqual([BATHS.gellert.id]);
    // Every part of every day is filled in the recorded trip (TRA-159).
    for (const day of snapshot.days) {
      for (const part of ["morning", "afternoon", "evening", "night"] as const) {
        expect(day.slots[part]).toHaveLength(1);
      }
    }
  });

  it("is empty for an empty itinerary", () => {
    expect(toItinerarySnapshot(EMPTY_ITINERARY)).toEqual({ stay_card_id: null, days: [] });
  });
});

// ─── computeMissing / hasItinerary / toHistory ─────────────────────────────

describe("computeMissing", () => {
  it("lists all five fields for the empty brief", () => {
    expect(computeMissing(EMPTY_BRIEF)).toEqual([...BRIEF_FIELDS]);
  });

  it("lists nothing for a complete brief", () => {
    expect(computeMissing(BRIEF_COMPLETE)).toEqual([]);
  });

  it("adults: 0 still counts travellers as missing", () => {
    expect(computeMissing({ ...BRIEF_COMPLETE, adults: 0 })).toEqual(["travellers"]);
  });
});

describe("hasItinerary", () => {
  it("is false for the empty itinerary", () => {
    expect(hasItinerary(EMPTY_ITINERARY)).toBe(false);
  });

  it("is true once there is a stay", () => {
    expect(hasItinerary({ ...EMPTY_ITINERARY, stay: HOTELS.rum })).toBe(true);
  });

  it("is true once there is a day", () => {
    const withDay = applyItineraryOp(EMPTY_ITINERARY, { op: "set_day_title", day: 1, title: "Day 1" });
    expect(hasItinerary(withDay)).toBe(true);
  });

  it("is true once there is a route", () => {
    const withRoute = applyItineraryOp(EMPTY_ITINERARY, {
      op: "set_route",
      origin: "Madrid",
      destination: "Budapest",
      outbound_date: null,
      return_date: null,
      deep_link: null,
    });
    expect(hasItinerary(withRoute)).toBe(true);
  });
});

describe("toHistory", () => {
  it("keeps only non-empty text messages, in order", () => {
    const messages: PlannerMessage[] = [
      { id: "m1", kind: "text", role: "user", content: "a" },
      { id: "m2", kind: "text", role: "assistant", content: "" },
      { id: "m3", kind: "options", groupId: "g1" },
      { id: "m4", kind: "selection", titles: ["x"] },
      { id: "m5", kind: "text", role: "assistant", content: "b" },
    ];
    expect(toHistory(messages)).toEqual([
      { role: "user", content: "a" },
      { role: "assistant", content: "b" },
    ]);
  });

  it("respects the limit, keeping the most recent", () => {
    const messages: PlannerMessage[] = Array.from({ length: 5 }, (_, i) => ({
      id: `m${i}`,
      kind: "text" as const,
      role: i % 2 === 0 ? ("user" as const) : ("assistant" as const),
      content: `msg${i}`,
    }));
    expect(toHistory(messages, 2)).toEqual([
      { role: "assistant", content: "msg3" },
      { role: "user", content: "msg4" },
    ]);
  });
});

// ─── plannerReducer ─────────────────────────────────────────────────────────

function hotelGroupState(): PlannerState {
  return plannerReducer(initialPlannerState(), {
    type: "event",
    event: {
      type: "options",
      group_id: GROUP_IDS.hotels,
      kind: "hotel",
      prompt: "Pick a hotel",
      slot: null,
      selection: "single",
      cards: [HOTELS.rum, HOTELS.mercure, HOTELS.basilica],
    },
  });
}

describe("plannerReducer — turn_started", () => {
  it("appends the user text and an empty assistant bubble, sets streaming and bumps turn", () => {
    const state = plannerReducer(initialPlannerState(), { type: "turn_started", message: "Hi" });
    expect(state.messages).toEqual([
      { id: "m1", kind: "text", role: "user", content: "Hi" },
      { id: "m2", kind: "text", role: "assistant", content: "" },
    ]);
    expect(state.status).toBe("streaming");
    expect(state.error).toBeNull();
    expect(state.turn).toBe(1);
  });

  it("does not append a user message when message is null", () => {
    const state = plannerReducer(initialPlannerState(), { type: "turn_started", message: null });
    expect(state.messages).toEqual([{ id: "m1", kind: "text", role: "assistant", content: "" }]);
  });
});

describe("plannerReducer — text event", () => {
  it("appends deltas to the open assistant bubble", () => {
    let state = plannerReducer(initialPlannerState(), { type: "turn_started", message: "Hi" });
    state = plannerReducer(state, { type: "event", event: { type: "text", delta: "Hel" } });
    state = plannerReducer(state, { type: "event", event: { type: "text", delta: "lo" } });
    expect(state.messages.at(-1)).toEqual({ id: "m2", kind: "text", role: "assistant", content: "Hello" });
  });

  it("opens a new assistant bubble after an options message", () => {
    let state = plannerReducer(initialPlannerState(), { type: "turn_started", message: "Hi" });
    state = plannerReducer(state, {
      type: "event",
      event: {
        type: "options",
        group_id: GROUP_IDS.hotels,
        kind: "hotel",
        prompt: "Pick",
        slot: null,
        selection: "single",
        cards: [HOTELS.rum],
      },
    });
    state = plannerReducer(state, { type: "event", event: { type: "text", delta: "After" } });
    expect(state.messages.at(-1)).toMatchObject({ kind: "text", role: "assistant", content: "After" });
  });
});

describe("plannerReducer — brief event", () => {
  it("sets brief and missing", () => {
    const state = plannerReducer(initialPlannerState(), {
      type: "event",
      event: { type: "brief", brief: BRIEF_COMPLETE, missing: [] },
    });
    expect(state.brief).toEqual(BRIEF_COMPLETE);
    expect(state.missing).toEqual([]);
  });
});

describe("plannerReducer — options event", () => {
  it("stores the group with empty selections, drops a trailing empty bubble and marks it pending", () => {
    let state = plannerReducer(initialPlannerState(), { type: "turn_started", message: "Hi" });
    state = plannerReducer(state, {
      type: "event",
      event: {
        type: "options",
        group_id: GROUP_IDS.hotels,
        kind: "hotel",
        prompt: "Pick a hotel",
        slot: null,
        selection: "single",
        cards: [HOTELS.rum],
      },
    });

    expect(state.groups[GROUP_IDS.hotels]).toEqual({
      group_id: GROUP_IDS.hotels,
      kind: "hotel",
      prompt: "Pick a hotel",
      slot: null,
      selection: "single",
      cards: [HOTELS.rum],
      selectedIds: [],
      dismissedIds: [],
    });
    expect(state.messages).toEqual([
      { id: "m1", kind: "text", role: "user", content: "Hi" },
      { id: expect.any(String), kind: "options", groupId: GROUP_IDS.hotels },
    ]);
    expect(state.pendingGroupIds).toEqual([GROUP_IDS.hotels]);
  });
});

describe("plannerReducer — itinerary_patch event", () => {
  it("applies the ops to the itinerary", () => {
    const state = plannerReducer(initialPlannerState(), {
      type: "event",
      event: { type: "itinerary_patch", ops: [{ op: "set_day_title", day: 1, title: "Day one" }] },
    });
    expect(state.itinerary.days).toEqual([
      { day: 1, title: "Day one", weather: null, slots: { morning: [], afternoon: [], evening: [], night: [] } },
    ]);
  });
});

describe("plannerReducer — error event", () => {
  it("sets status error and error kind unauthorized for error_code unauthorized", () => {
    const state = plannerReducer(initialPlannerState(), {
      type: "event",
      event: { type: "error", error: "no token", error_code: "unauthorized" },
    });
    expect(state.status).toBe("error");
    expect(state.error).toBe("unauthorized");
  });

  it("sets a generic error kind for any other error_code", () => {
    const state = plannerReducer(initialPlannerState(), {
      type: "event",
      event: { type: "error", error: "boom", error_code: "rate_limited" },
    });
    expect(state.error).toBe("generic");
  });

  it("drops a trailing empty assistant bubble", () => {
    let state = plannerReducer(initialPlannerState(), { type: "turn_started", message: "Hi" });
    state = plannerReducer(state, {
      type: "event",
      event: { type: "error", error: "boom", error_code: "x" },
    });
    expect(state.messages).toEqual([{ id: "m1", kind: "text", role: "user", content: "Hi" }]);
  });
});

describe("plannerReducer — turn_finished", () => {
  it("returns to idle and drops a trailing empty bubble", () => {
    let state = plannerReducer(initialPlannerState(), { type: "turn_started", message: "Hi" });
    state = plannerReducer(state, { type: "turn_finished" });
    expect(state.status).toBe("idle");
    expect(state.messages).toEqual([{ id: "m1", kind: "text", role: "user", content: "Hi" }]);
  });

  it("keeps status error after an error event", () => {
    let state = plannerReducer(initialPlannerState(), { type: "turn_started", message: "Hi" });
    state = plannerReducer(state, {
      type: "event",
      event: { type: "error", error: "boom", error_code: "x" },
    });
    state = plannerReducer(state, { type: "turn_finished" });
    expect(state.status).toBe("error");
  });
});

describe("plannerReducer — turn_failed", () => {
  it("sets status error, the error kind, and drops the trailing empty bubble", () => {
    let state = plannerReducer(initialPlannerState(), { type: "turn_started", message: "Hi" });
    state = plannerReducer(state, { type: "turn_failed", error: "unauthorized" });
    expect(state.status).toBe("error");
    expect(state.error).toBe("unauthorized");
    expect(state.messages).toEqual([{ id: "m1", kind: "text", role: "user", content: "Hi" }]);
  });
});

describe("plannerReducer — brief_patched", () => {
  it("merges the patch into the brief and recomputes missing", () => {
    const state = plannerReducer(initialPlannerState(), {
      type: "brief_patched",
      patch: { destination: "Budapest" },
    });
    expect(state.brief.destination).toBe("Budapest");
    expect(state.missing).toEqual(["origin", "dates", "travellers", "interests"]);
  });
});

describe("plannerReducer — selected", () => {
  it("on a hotel group sets the stay optimistically, adds a selection chip and unpends the group", () => {
    const state = plannerReducer(hotelGroupState(), {
      type: "selected",
      groupId: GROUP_IDS.hotels,
      cardIds: [HOTELS.rum.id],
    });
    expect(state.itinerary.stay).toEqual(HOTELS.rum);
    expect(state.groups[GROUP_IDS.hotels]?.selectedIds).toEqual([HOTELS.rum.id]);
    expect(state.messages.at(-1)).toEqual({
      id: expect.any(String),
      kind: "selection",
      titles: [HOTELS.rum.title],
    });
    expect(state.pendingGroupIds).not.toContain(GROUP_IDS.hotels);
  });

  it("on a group with a slot puts the picked cards into that slot", () => {
    let state = plannerReducer(initialPlannerState(), {
      type: "event",
      event: {
        type: "options",
        group_id: GROUP_IDS.baths,
        kind: "experience",
        prompt: "Thermal baths for day 2 · afternoon",
        slot: { day: 2, part: "afternoon" },
        selection: "single",
        cards: [BATHS.rudas, BATHS.szechenyi, BATHS.veliBej],
      },
    });
    state = plannerReducer(state, {
      type: "selected",
      groupId: GROUP_IDS.baths,
      cardIds: [BATHS.rudas.id],
    });
    expect(state.itinerary.days).toEqual([
      { day: 2, title: null, weather: null, slots: { morning: [], afternoon: [BATHS.rudas], evening: [], night: [] } },
    ]);
  });

  it("on a neighbourhood group (no slot) only adds the chip; the itinerary is untouched", () => {
    let state = plannerReducer(initialPlannerState(), {
      type: "event",
      event: {
        type: "options",
        group_id: GROUP_IDS.neighbourhoods,
        kind: "neighbourhood",
        prompt: "Where would you like to stay?",
        slot: null,
        selection: "single",
        cards: [NEIGHBOURHOODS.belvaros, NEIGHBOURHOODS.erzsebetvaros, NEIGHBOURHOODS.budavar],
      },
    });
    state = plannerReducer(state, {
      type: "selected",
      groupId: GROUP_IDS.neighbourhoods,
      cardIds: [NEIGHBOURHOODS.belvaros.id],
    });
    expect(state.itinerary).toEqual(EMPTY_ITINERARY);
    expect(state.messages.at(-1)).toEqual({
      id: expect.any(String),
      kind: "selection",
      titles: [NEIGHBOURHOODS.belvaros.title],
    });
  });

  it("a later itinerary_patch with the same put_activity does not duplicate the optimistic card", () => {
    let state = plannerReducer(initialPlannerState(), {
      type: "event",
      event: {
        type: "options",
        group_id: GROUP_IDS.baths,
        kind: "experience",
        prompt: "Baths",
        slot: { day: 2, part: "afternoon" },
        selection: "single",
        cards: [BATHS.rudas],
      },
    });
    state = plannerReducer(state, {
      type: "selected",
      groupId: GROUP_IDS.baths,
      cardIds: [BATHS.rudas.id],
    });
    state = plannerReducer(state, {
      type: "event",
      event: {
        type: "itinerary_patch",
        ops: [{ op: "put_activity", slot: { day: 2, part: "afternoon" }, card: BATHS.rudas }],
      },
    });
    expect(state.itinerary.days.find((d) => d.day === 2)?.slots.afternoon).toEqual([BATHS.rudas]);
  });

  it("is a no-op for an unknown group id", () => {
    const before = initialPlannerState();
    const state = plannerReducer(before, { type: "selected", groupId: "missing", cardIds: ["x"] });
    expect(state).toBe(before);
  });

  it("is a no-op for unknown card ids in a known group", () => {
    const before = hotelGroupState();
    const state = plannerReducer(before, {
      type: "selected",
      groupId: GROUP_IDS.hotels,
      cardIds: ["does-not-exist"],
    });
    expect(state).toBe(before);
  });
});

describe("plannerReducer — dismissed", () => {
  it("adds the card id once, ignoring a repeat", () => {
    let state = plannerReducer(hotelGroupState(), {
      type: "dismissed",
      groupId: GROUP_IDS.hotels,
      cardId: HOTELS.mercure.id,
    });
    state = plannerReducer(state, {
      type: "dismissed",
      groupId: GROUP_IDS.hotels,
      cardId: HOTELS.mercure.id,
    });
    expect((state.groups[GROUP_IDS.hotels] as OptionGroupState).dismissedIds).toEqual([
      HOTELS.mercure.id,
    ]);
  });
});

describe("plannerReducer — shortlist_toggled", () => {
  it("adds then removes the card id", () => {
    let state = plannerReducer(initialPlannerState(), { type: "shortlist_toggled", cardId: "c1" });
    expect(state.shortlist).toEqual(["c1"]);
    state = plannerReducer(state, { type: "shortlist_toggled", cardId: "c1" });
    expect(state.shortlist).toEqual([]);
  });
});

describe("plannerReducer — removed", () => {
  it("takes the card out of its slot", () => {
    let state = plannerReducer(initialPlannerState(), {
      type: "event",
      event: {
        type: "itinerary_patch",
        ops: [{ op: "put_activity", slot: { day: 1, part: "morning" }, card: BATHS.gellert }],
      },
    });
    state = plannerReducer(state, {
      type: "removed",
      slot: { day: 1, part: "morning" },
      cardId: BATHS.gellert.id,
    });
    expect(state.itinerary.days[0]?.slots.morning).toEqual([]);
  });
});

describe("plannerReducer — reset", () => {
  it("returns to the initial state", () => {
    let state = plannerReducer(initialPlannerState(), { type: "turn_started", message: "Hi" });
    state = plannerReducer(state, { type: "reset" });
    expect(state).toEqual(initialPlannerState());
  });
});

describe("initialPlannerState", () => {
  it("restores a draft's fields and starts idle at turn 0", () => {
    const draft: PlannerDraft = {
      messages: [{ id: "m1", kind: "text", role: "user", content: "Hi" }],
      groups: {},
      brief: BRIEF_COMPLETE,
      missing: [],
      itinerary: EMPTY_ITINERARY,
      shortlist: ["c1"],
    };
    const state = initialPlannerState(draft);
    expect(state.messages).toEqual(draft.messages);
    expect(state.brief).toEqual(BRIEF_COMPLETE);
    expect(state.missing).toEqual([]);
    expect(state.shortlist).toEqual(["c1"]);
    expect(state.status).toBe("idle");
    expect(state.error).toBeNull();
    expect(state.turn).toBe(0);
  });

  it("derives pendingGroupIds from groups that have no selection yet", () => {
    const groups: Record<string, OptionGroupState> = {
      g1: {
        group_id: "g1",
        kind: "hotel",
        prompt: "",
        slot: null,
        selection: "single",
        cards: [],
        selectedIds: [],
        dismissedIds: [],
      },
      g2: {
        group_id: "g2",
        kind: "hotel",
        prompt: "",
        slot: null,
        selection: "single",
        cards: [],
        selectedIds: ["x"],
        dismissedIds: [],
      },
    };
    const draft: PlannerDraft = {
      messages: [],
      groups,
      brief: EMPTY_BRIEF,
      missing: [...BRIEF_FIELDS],
      itinerary: EMPTY_ITINERARY,
      shortlist: [],
    };
    const state = initialPlannerState(draft);
    expect(state.pendingGroupIds).toEqual(["g1"]);
  });

  it("defaults to the empty state without a draft", () => {
    const state = initialPlannerState();
    expect(state.messages).toEqual([]);
    expect(state.groups).toEqual({});
    expect(state.brief).toEqual(EMPTY_BRIEF);
    expect(state.missing).toEqual([...BRIEF_FIELDS]);
    expect(state.itinerary).toEqual(EMPTY_ITINERARY);
    expect(state.shortlist).toEqual([]);
    expect(state.pendingGroupIds).toEqual([]);
  });
});
