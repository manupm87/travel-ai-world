import { describe, expect, it } from "vitest";
import { CHAT_TURN, INSPECTOR_TURN } from "@/test/fixtures/admin-turn";
import { dayFromName, modelCalls, parseOutput, validationChips } from "./modelCalls";
import type { Span } from "./types";

function llm(payload: Record<string, unknown>, name = "day_picks:2"): Span {
  return {
    seq: 1,
    parent_seq: null,
    kind: "llm",
    name,
    phase: "fold",
    t0_ms: 0,
    dur_ms: 10,
    level: "default",
    message: null,
    payload,
    results: [],
  };
}

describe("modelCalls", () => {
  it("makes one tab per llm step, in seq order, labelled by schema and day", () => {
    const tabs = modelCalls(INSPECTOR_TURN.spans, INSPECTOR_TURN.summary.prices_stripped);
    expect(tabs.map((t) => [t.label, t.day])).toEqual([
      ["Skeleton", null],
      ["DayPicks", 1],
      ["DayPicks", 2],
      ["DayPicks", 3],
      ["DayPicks", 4],
    ]);
  });

  it("labels a call without a schema by its operation", () => {
    const [tab] = modelCalls(CHAT_TURN.spans, 0);
    expect(tab!.label).toBe("chat");
    expect(tab!.output).toEqual({ kind: "text", text: "Yes, every day from 7:00." });
    expect(tab!.ttfcMs).toBe(480);
  });

  it("reads the day at the end of a step name only", () => {
    expect(dayFromName("day_picks:2")).toBe(2);
    expect(dayFromName("skeleton")).toBeNull();
    expect(dayFromName("pick_hotels")).toBeNull();
  });
});

describe("parseOutput", () => {
  it("pretty-prints JSON, fenced or not", () => {
    expect(parseOutput('{"a":1}')).toEqual({ kind: "json", text: '{\n  "a": 1\n}' });
    expect(parseOutput('```json\n{"a":1}\n```')).toEqual({ kind: "json", text: '{\n  "a": 1\n}' });
  });

  it("keeps anything else as text, and nothing as null", () => {
    expect(parseOutput("Here is your plan")).toEqual({ kind: "text", text: "Here is your plan" });
    expect(parseOutput("42")).toEqual({ kind: "text", text: "42" });
    expect(parseOutput("")).toBeNull();
    expect(parseOutput(null)).toBeNull();
  });
});

describe("validationChips", () => {
  it("validated when the first answer passed", () => {
    const chips = validationChips(llm({ schema: "DayPicks", attempts: 1, repaired: false, dropped_ids: [] }), null);
    expect(chips).toEqual([
      { id: "validated", tone: "success" },
      { id: "dropped", tone: "muted", count: 0 },
    ]);
  });

  it("repairs in gold when the answer had to be repaired", () => {
    const chips = validationChips(llm({ schema: "DayPicks", attempts: 2, repaired: true, dropped_ids: [] }), null);
    expect(chips[0]).toEqual({ id: "repairs", tone: "gold", count: 1 });
  });

  it("dropped ids in gold when the model invented any", () => {
    const chips = validationChips(llm({ schema: "DayPicks", attempts: 1, dropped_ids: ["x", "y"] }), null);
    expect(chips).toContainEqual({ id: "dropped", tone: "gold", count: 2 });
  });

  it("no schema chip for a chat call", () => {
    const chips = validationChips(llm({ operation: "chat", attempts: 1 }, "chat"), null);
    expect(chips.map((c) => c.id)).toEqual(["dropped"]);
  });

  it("the stripped prices once, on the last tab", () => {
    const tabs = modelCalls(INSPECTOR_TURN.spans, 2);
    const withPrices = tabs.filter((t) => t.chips.some((c) => c.id === "prices"));
    expect(withPrices).toHaveLength(1);
    expect(withPrices[0]).toBe(tabs[tabs.length - 1]);
    expect(withPrices[0]!.chips).toContainEqual({ id: "prices", tone: "gold", count: 2 });
  });

  it("the fixture: day 2 repaired, day 3 dropped an id", () => {
    const tabs = modelCalls(INSPECTOR_TURN.spans, 2);
    expect(tabs[2]!.chips[0]).toMatchObject({ id: "repairs" });
    expect(tabs[3]!.chips).toContainEqual({ id: "dropped", tone: "gold", count: 1 });
  });
});
