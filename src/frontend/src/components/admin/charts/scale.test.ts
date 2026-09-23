import { describe, expect, it } from "vitest";
import {
  daysBetween,
  fillDays,
  linearScale,
  maxStack,
  niceCeil,
  stackDay,
  ticks,
} from "./scale";

describe("chart scales", () => {
  it("maps a domain linearly onto a range, inverted ranges included", () => {
    const y = linearScale([0, 10], [100, 0]);
    expect(y(0)).toBe(100);
    expect(y(5)).toBe(50);
    expect(y(10)).toBe(0);
    expect(linearScale([3, 3], [7, 9])(3)).toBe(7);
  });

  it("rounds a maximum up to 1, 2 or 5 times a power of ten", () => {
    expect(niceCeil(0)).toBe(1);
    expect(niceCeil(-4)).toBe(1);
    expect(niceCeil(1)).toBe(1);
    expect(niceCeil(7)).toBe(10);
    expect(niceCeil(13)).toBe(20);
    expect(niceCeil(42)).toBe(50);
    expect(niceCeil(0.3)).toBe(0.5);
    expect(niceCeil(1200)).toBe(2000);
  });

  it("spaces ticks evenly from zero", () => {
    expect(ticks(20)).toEqual([0, 5, 10, 15, 20]);
    expect(ticks(1, 2)).toEqual([0, 0.5, 1]);
  });

  it("lists every day of a range, both ends included", () => {
    expect(daysBetween("2026-09-29", "2026-10-02")).toEqual([
      "2026-09-29",
      "2026-09-30",
      "2026-10-01",
      "2026-10-02",
    ]);
    expect(daysBetween("2026-10-02", "2026-10-01")).toEqual([]);
  });

  it("fills the days the stats did not mention with zeros", () => {
    const filled = fillDays("2026-09-01", "2026-09-03", [
      { ...fillDays("2026-09-02", "2026-09-02", [])[0]!, turns: 3, ok: 3 },
    ]);
    expect(filled.map((d) => [d.day, d.turns])).toEqual([
      ["2026-09-01", 0],
      ["2026-09-02", 3],
      ["2026-09-03", 0],
    ]);
  });

  it("stacks ok, errors and cancelled from the baseline up, skipping empty parts", () => {
    expect(stackDay({ ok: 4, errors: 0, cancelled: 2 })).toEqual([
      { key: "ok", value: 4, y0: 0, y1: 4 },
      { key: "cancelled", value: 2, y0: 4, y1: 6 },
    ]);
    expect(stackDay({ ok: 0, errors: 0, cancelled: 0 })).toEqual([]);
    expect(
      maxStack([
        { ok: 1, errors: 1, cancelled: 0 },
        { ok: 5, errors: 2, cancelled: 1 },
      ])
    ).toBe(8);
    expect(maxStack([])).toBe(0);
  });
});
