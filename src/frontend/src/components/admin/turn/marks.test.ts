import { describe, expect, it } from "vitest";
import type { TurnDetail } from "@/services/admin";
import { CHAT_TURN, INSPECTOR_TURN } from "@/test/fixtures/admin-turn";
import { SECTION_IDS, marksInto, turnMarks } from "./marks";
import { travellerSummary } from "./traveller";

const marksOf = (turn: TurnDetail) => turnMarks(turn, travellerSummary(turn.context));

describe("turnMarks", () => {
  it("the rich turn has all four, each leading to its section", () => {
    const marks = marksOf(INSPECTOR_TURN);
    expect(marks.map((m) => [m.n, m.host, m.target, m.tab])).toEqual([
      [1, "answer", SECTION_IDS.events, "events"],
      [2, "itinerary", SECTION_IDS.model, "model"],
      [3, "warning", "turn-step-18", "trace"],
      [4, "cards", "turn-kb-2", "kb"],
    ]);
  });

  it("the chat turn has only the answer's mark: no itinerary, no warning, no cards", () => {
    expect(marksOf(CHAT_TURN).map((m) => m.n)).toEqual([1]);
  });

  it("no answer mark without a timeline, no itinerary mark without a model call", () => {
    const turn = { ...INSPECTOR_TURN, timeline: [], spans: INSPECTOR_TURN.spans.filter((s) => s.kind !== "llm") };
    expect(marksOf(turn).map((m) => m.n)).toEqual([3, 4]);
  });

  it("no cards mark without a search", () => {
    const turn = { ...INSPECTOR_TURN, spans: INSPECTOR_TURN.spans.filter((s) => s.kind !== "retriever") };
    expect(marksOf(turn).map((m) => m.n)).toEqual([1, 2, 3]);
  });

  it("a warning with no warned step leads to the waterfall itself", () => {
    const turn = {
      ...INSPECTOR_TURN,
      spans: INSPECTOR_TURN.spans.map((s) => ({ ...s, level: "default" as const })),
    };
    expect(marksOf(turn).find((m) => m.n === 3)!.target).toBe(SECTION_IDS.trace);
  });

  it("marksInto picks the marks of one section", () => {
    expect(marksInto(marksOf(INSPECTOR_TURN), "events").map((m) => m.n)).toEqual([1]);
  });
});
