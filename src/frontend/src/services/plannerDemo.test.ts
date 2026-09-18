import { describe, expect, it } from "vitest";
import {
  BATHS,
  BRIEF_AFTER_FIRST_MESSAGE,
  BRIEF_COMPLETE,
  EXTRAS,
  FIRST_ITINERARY_OPS,
  GROUP_IDS,
  HOTELS,
  RESTAURANTS,
  TURNS,
  USER_MESSAGES,
} from "@/data/planner-demo/session";
import { EMPTY_ITINERARY, applyItineraryOps, toItinerarySnapshot } from "@/hooks/plannerReducer";
import type { PlannerEvent, PlannerTurn } from "@/types/planner";
import { demoEventsFor, slotFromMessage, streamDemoTurn, toDeltas } from "./plannerDemo";

const ITINERARY = toItinerarySnapshot(applyItineraryOps(EMPTY_ITINERARY, FIRST_ITINERARY_OPS));

function turn(overrides: Partial<PlannerTurn> = {}): PlannerTurn {
  return {
    message: null,
    action: null,
    history: [],
    brief: null,
    itinerary: null,
    trip_id: null,
    ...overrides,
  };
}

const types = (events: PlannerEvent[]) => events.map((e) => e.type);

describe("demoEventsFor", () => {
  it("reads the brief from the opening message", () => {
    expect(demoEventsFor(turn({ message: USER_MESSAGES.opening }))).toEqual(TURNS.opening);
  });

  it("answers the dates quick reply with the neighbourhoods", () => {
    const events = demoEventsFor(
      turn({ message: USER_MESSAGES.dates, brief: BRIEF_AFTER_FIRST_MESSAGE })
    );
    expect(events).toEqual(TURNS.dates);
  });

  it("nudges for the dates when anything else is typed without them", () => {
    const events = demoEventsFor(turn({ message: "make it cheaper", brief: BRIEF_AFTER_FIRST_MESSAGE }));
    expect(types(events)).toEqual(["text", "done"]);
  });

  it("walks neighbourhood → hotel → itinerary from the selections", () => {
    expect(
      demoEventsFor(
        turn({ action: { type: "select", group_id: GROUP_IDS.neighbourhoods, card_ids: ["x"] } })
      )
    ).toEqual(TURNS.neighbourhood);
    expect(
      demoEventsFor(turn({ action: { type: "select", group_id: GROUP_IDS.hotels, card_ids: ["x"] } }))
    ).toEqual(TURNS.hotel);
  });

  it("generates the itinerary from the checklist button once the brief is complete", () => {
    expect(demoEventsFor(turn({ message: "Generate the trip", brief: BRIEF_COMPLETE }))).toEqual(
      TURNS.hotel
    );
  });

  it("offers the recorded baths for day 2 · afternoon and fresh extras for any other slot", () => {
    const recorded = demoEventsFor(
      turn({ message: USER_MESSAGES.alternatives, brief: BRIEF_COMPLETE, itinerary: ITINERARY })
    );
    expect(recorded).toEqual(TURNS.alternatives);

    const other = demoEventsFor(
      turn({ message: "Alternatives for day 3 · Night", brief: BRIEF_COMPLETE, itinerary: ITINERARY })
    );
    const group = other.find((e) => e.type === "options");
    expect(group).toMatchObject({ slot: { day: 3, part: "night" }, selection: "single" });
    const ids = group && group.type === "options" ? group.cards.map((c) => c.id) : [];
    expect(ids).toHaveLength(3);
    // Nothing already in the trip is offered again.
    expect(ids).not.toContain(EXTRAS.basilica.id);
    expect(ids).not.toContain(BATHS.gellert.id);
  });

  it("puts a picked alternative into its slot, replacing what was there", () => {
    const events = demoEventsFor(
      turn({
        action: { type: "select", group_id: "g-alt-day2-night", card_ids: [EXTRAS.gozsdu.id] },
        itinerary: ITINERARY,
      })
    );
    const patch = events.find((e) => e.type === "itinerary_patch");
    expect(patch).toMatchObject({
      ops: [
        { op: "remove_activity", slot: { day: 2, part: "night" }, card_id: "wv:en:Budapest/Erzsébetváros#drink:szimpla-kert-mozi" },
        { op: "put_activity", slot: { day: 2, part: "night" }, card: EXTRAS.gozsdu },
      ],
    });
  });

  it("answers the suggestion chips with patches and carousels", () => {
    const cheaper = demoEventsFor(turn({ message: "Make it cheaper", brief: BRIEF_COMPLETE, itinerary: ITINERARY }));
    expect(cheaper).toContainEqual({ type: "itinerary_patch", ops: [{ op: "set_stay", card: HOTELS.cheaper }] });

    const thermal = demoEventsFor(turn({ message: "Add a thermal bath day", brief: BRIEF_COMPLETE, itinerary: ITINERARY }));
    const patch = thermal.find((e) => e.type === "itinerary_patch");
    expect(patch && patch.type === "itinerary_patch" ? patch.ops.at(-1) : null).toEqual({
      op: "put_activity",
      slot: { day: 3, part: "afternoon" },
      card: BATHS.szechenyi,
    });

    const restaurants = demoEventsFor(
      turn({ message: "Hungarian restaurants nearby", brief: BRIEF_COMPLETE, itinerary: ITINERARY })
    );
    expect(restaurants.find((e) => e.type === "options")).toMatchObject({
      group_id: GROUP_IDS.restaurants,
      cards: [RESTAURANTS.menza, RESTAURANTS.friciPapa, RESTAURANTS.langos],
    });
  });

  it("acknowledges a removal and falls back politely on anything else", () => {
    expect(
      types(
        demoEventsFor(
          turn({ action: { type: "remove", slot: { day: 1, part: "evening" }, card_id: "wv:en:Budapest/Belváros#see:szechenyi-chain-bridge" } })
        )
      )
    ).toEqual(["text", "done"]);
    expect(demoEventsFor(turn({ message: "tell me a joke", brief: BRIEF_COMPLETE, itinerary: ITINERARY }))).toEqual(
      TURNS.fallback
    );
  });
});

describe("slotFromMessage / toDeltas", () => {
  it("parses English and Spanish slot names", () => {
    expect(slotFromMessage("Alternatives for day 2 · Afternoon")).toEqual({ day: 2, part: "afternoon" });
    expect(slotFromMessage("Alternativas para el día 3 · Noche")).toEqual({ day: 3, part: "night" });
    expect(slotFromMessage("Alternatives for day 5")).toEqual({ day: 5, part: null });
    expect(slotFromMessage("no day here")).toBeNull();
  });

  it("splits text into word-sized deltas that concatenate back", () => {
    const deltas = toDeltas("Good plan! Late October.");
    expect(deltas.length).toBeGreaterThan(2);
    expect(deltas.join("")).toBe("Good plan! Late October.");
  });
});

describe("streamDemoTurn", () => {
  it("streams the answer word by word with done last, at once in fast mode", async () => {
    const out: PlannerEvent[] = [];
    for await (const e of streamDemoTurn(turn({ message: USER_MESSAGES.opening }), { fast: true })) out.push(e);

    expect(out.at(-1)).toEqual({ type: "done" });
    expect(out.filter((e) => e.type === "brief")).toHaveLength(1);
    const text = out.filter((e) => e.type === "text").map((e) => (e.type === "text" ? e.delta : "")).join("");
    expect(text).toBe(
      "Good plan! Late October is a great time for the thermal baths. Which dates suit you best?"
    );
  });

  it("stops quietly when aborted", async () => {
    const controller = new AbortController();
    const out: PlannerEvent[] = [];
    for await (const e of streamDemoTurn(turn({ message: USER_MESSAGES.opening }), {
      fast: true,
      signal: controller.signal,
    })) {
      out.push(e);
      if (out.length === 2) controller.abort();
    }
    expect(out).toHaveLength(2);
  });
});
