/**
 * The pure geometry behind the admin console's hand-drawn SVG charts
 * (TRA-222): no chart library, so the scales, the ticks and the stacks live
 * here and are unit-tested without a DOM.
 */

import type { DayStats } from "@/services/admin";

/** A linear map from `[d0, d1]` onto `[r0, r1]`; a flat domain maps to `r0`. */
export function linearScale(
  [d0, d1]: [number, number],
  [r0, r1]: [number, number]
): (value: number) => number {
  const span = d1 - d0;
  return (value) => (span === 0 ? r0 : r0 + ((value - d0) / span) * (r1 - r0));
}

/** The smallest "nice" number (1, 2 or 5 × 10ⁿ) at or above `value`; 1 for anything ≤ 0. */
export function niceCeil(value: number): number {
  if (!(value > 0)) return 1;
  const power = 10 ** Math.floor(Math.log10(value));
  for (const step of [1, 2, 5, 10]) {
    if (step * power >= value) return step * power;
  }
  return 10 * power;
}

/** `count + 1` evenly spaced ticks from 0 to `max`, integers when `max` allows it. */
export function ticks(max: number, count = 4): number[] {
  const step = max / count;
  return Array.from({ length: count + 1 }, (_, i) => {
    const value = step * i;
    return Number.isInteger(max) && max >= count ? Math.round(value) : value;
  });
}

/** Every UTC day from `start` to `end` (both `YYYY-MM-DD`, included). */
export function daysBetween(start: string, end: string): string[] {
  const out: string[] = [];
  const last = Date.parse(`${end}T00:00:00Z`);
  for (let t = Date.parse(`${start}T00:00:00Z`); t <= last; t += 86_400_000) {
    out.push(new Date(t).toISOString().slice(0, 10));
  }
  return out;
}

/** An empty day: what the chart draws for a day the stats did not mention. */
export function emptyDay(day: string): DayStats {
  return {
    day,
    turns: 0,
    ok: 0,
    errors: 0,
    cancelled: 0,
    input_tokens: 0,
    output_tokens: 0,
    embed_tokens: 0,
    cost_usd: 0,
    latency_p50_ms: null,
    latency_p95_ms: null,
    first_event_p50_ms: null,
  };
}

/** The stats' days laid on the whole range, a zero day wherever one is missing. */
export function fillDays(start: string, end: string, days: DayStats[]): DayStats[] {
  const byDay = new Map(days.map((d) => [d.day, d]));
  return daysBetween(start, end).map((day) => byDay.get(day) ?? emptyDay(day));
}

export type StackKey = "ok" | "errors" | "cancelled";

export interface StackSegment {
  key: StackKey;
  value: number;
  /** Bottom and top of the segment, in data units. */
  y0: number;
  y1: number;
}

/** The order the bar is stacked in, from the baseline up. */
export const STACK_ORDER: StackKey[] = ["ok", "errors", "cancelled"];

/** A day's bar as segments from the baseline up; empty segments are left out. */
export function stackDay(day: Pick<DayStats, StackKey>): StackSegment[] {
  let base = 0;
  const segments: StackSegment[] = [];
  for (const key of STACK_ORDER) {
    const value = day[key];
    if (value <= 0) continue;
    segments.push({ key, value, y0: base, y1: base + value });
    base += value;
  }
  return segments;
}

/** The tallest stacked bar of a set of days (0 when all are empty). */
export function maxStack(days: Pick<DayStats, StackKey>[]): number {
  return days.reduce((max, d) => Math.max(max, d.ok + d.errors + d.cancelled), 0);
}
