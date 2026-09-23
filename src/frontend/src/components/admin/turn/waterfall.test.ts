import { describe, expect, it } from "vitest";
import { INSPECTOR_TURN } from "@/test/fixtures/admin-turn";
import type { Span } from "./types";
import { MIN_BAR_PX, barStyle, scaleEnd, spanSubtitle, waterfall } from "./waterfall";

function span(seq: number, overrides: Partial<Span> = {}): Span {
  return {
    seq,
    parent_seq: null,
    kind: "chain",
    name: `step-${seq}`,
    phase: "open",
    t0_ms: 0,
    dur_ms: 10,
    level: "default",
    message: null,
    payload: {},
    results: [],
    ...overrides,
  };
}

describe("waterfall", () => {
  it("groups the steps under the five phases in running order, each in seq order", () => {
    const groups = waterfall(INSPECTOR_TURN.spans, INSPECTOR_TURN.summary.latency_ms);
    expect(groups.map((g) => g.phase)).toEqual(["open", "wardrobe", "fold", "weigh", "zip"]);
    for (const group of groups) {
      const seqs = group.rows.map((r) => r.span.seq);
      expect(seqs).toEqual([...seqs].sort((a, b) => a - b));
    }
  });

  it("sorts by seq whatever the input order and leaves empty phases out", () => {
    const groups = waterfall(
      [span(3, { phase: "zip" }), span(2, { phase: "open" }), span(1, { phase: "open" })],
      100
    );
    expect(groups.map((g) => g.phase)).toEqual(["open", "zip"]);
    expect(groups[0]!.rows.map((r) => r.span.seq)).toEqual([1, 2]);
  });

  it("indents a step under its parent, and a grandchild further", () => {
    const [group] = waterfall(
      [span(1), span(2, { parent_seq: 1 }), span(3, { parent_seq: 2 }), span(4, { parent_seq: 99 })],
      100
    );
    expect(group!.rows.map((r) => r.depth)).toEqual([0, 1, 2, 0]);
  });

  it("places bars on the latency scale", () => {
    const [group] = waterfall([span(1, { t0_ms: 250, dur_ms: 500 })], 1000);
    expect(group!.rows[0]).toMatchObject({ start: 0.25, width: 0.5 });
  });

  it("stretches the scale when a step ends after the latency", () => {
    expect(scaleEnd([span(1, { t0_ms: 900, dur_ms: 300 })], 1000)).toBe(1200);
  });

  it("keeps a zero-length bar visible with the minimum width", () => {
    const [group] = waterfall([span(1, { t0_ms: 1000, dur_ms: 0 })], 1000);
    const style = barStyle(group!.rows[0]!);
    expect(group!.rows[0]!.width).toBe(0);
    expect(style.width).toBe(`max(${MIN_BAR_PX}px, 0%)`);
    expect(style.left).toBe(`min(100%, calc(100% - ${MIN_BAR_PX}px))`);
  });

  it("treats an unfinished step (no duration) as zero-length", () => {
    const [group] = waterfall([span(1, { dur_ms: null })], 100);
    expect(group!.rows[0]!.width).toBe(0);
  });

  it("flags warnings and errors", () => {
    const [group] = waterfall(
      [span(1, { level: "warning" }), span(2, { level: "error" }), span(3)],
      100
    );
    expect(group!.rows.map((r) => r.flag)).toEqual(["warning", "error", null]);
  });

  it("the fixture's validate_day is the warning row", () => {
    const rows = waterfall(INSPECTOR_TURN.spans, INSPECTOR_TURN.summary.latency_ms).flatMap((g) => g.rows);
    expect(rows.filter((r) => r.flag).map((r) => r.span.name)).toEqual(["validate_day"]);
  });
});

describe("spanSubtitle", () => {
  it("names the schema of a model call, else its operation", () => {
    expect(spanSubtitle(span(1, { kind: "llm", payload: { schema: "DayPicks", operation: "structured" } }))).toEqual([
      "DayPicks",
    ]);
    expect(spanSubtitle(span(1, { kind: "llm", payload: { schema: null, operation: "chat" } }))).toEqual(["chat"]);
  });

  it("gives a search its purpose and the first 40 characters of its query", () => {
    const query = "thermal baths and food in Budapest, afternoon of day 2";
    expect(spanSubtitle(span(1, { kind: "retriever", name: "fetch", payload: { purpose: "hotels", query } }))).toEqual([
      "hotels",
      `${query.slice(0, 40)}…`,
    ]);
    expect(
      spanSubtitle(span(1, { kind: "retriever", name: "search:hotels", payload: { purpose: "hotels", query: "x" } }))
    ).toEqual(["x"]);
  });

  it("gives a tool its service and a code step nothing", () => {
    expect(spanSubtitle(span(1, { kind: "tool", payload: { service: "open-meteo" } }))).toEqual(["open-meteo"]);
    expect(spanSubtitle(span(1, { kind: "chain", payload: { details: {} } }))).toEqual([]);
  });
});
