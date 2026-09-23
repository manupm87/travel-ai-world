/**
 * The trace as a waterfall (TRA-228), pure: the steps grouped under the five
 * phases in `seq` order, each indented under its parent and placed on the
 * turn's time scale. The component only paints what this returns.
 */

import { num, str, type Phase, type Span, type SpanKind } from "./types";

/** The five phases in the order a turn runs them (ADR 0024). */
export const PHASES: readonly Phase[] = ["open", "wardrobe", "fold", "weigh", "zip"];

/** Every step kind in the legend's order. */
export const SPAN_KINDS: readonly SpanKind[] = ["llm", "retriever", "tool", "chain"];

/** The token a kind's bar is painted with (`docs/design/kyrian-world.md`, "Admin console"). */
export const KIND_BAR: Record<SpanKind, string> = {
  llm: "bg-purple",
  retriever: "bg-success",
  tool: "bg-accent",
  chain: "bg-text-muted",
};

/** A bar never gets narrower than this, so a 0 ms step still shows. */
export const MIN_BAR_PX = 2;

/** The deepest indent drawn; deeper steps line up with it. */
export const MAX_DEPTH = 3;

const SUBTITLE_QUERY_CHARS = 40;

export interface WaterfallRow {
  span: Span;
  /** How many parents it has (0 for a top-level step), capped at `MAX_DEPTH`. */
  depth: number;
  /** Where the bar starts, 0..1 of the scale. */
  start: number;
  /** How wide it is, 0..1 of the scale (before the minimum width). */
  width: number;
  /** `warning` or `error` when the step says so; `null` otherwise. */
  flag: "warning" | "error" | null;
  /** What the step's payload adds to its name, in order. */
  subtitle: string[];
}

export interface PhaseGroup {
  phase: Phase;
  rows: WaterfallRow[];
}

/**
 * What a step's payload adds to its name: the schema of a model call, the
 * purpose (unless the name carries it) and the query of a search, the
 * service of a tool.
 */
export function spanSubtitle(span: Span): string[] {
  const p = span.payload;
  if (span.kind === "llm") {
    const label = str(p.schema) ?? str(p.operation);
    return label ? [label] : [];
  }
  if (span.kind === "retriever") {
    const parts: string[] = [];
    const purpose = str(p.purpose);
    const query = str(p.query);
    // `search:hotels` already says its purpose; a name that does not gets it here.
    if (purpose && !span.name.includes(purpose)) parts.push(purpose);
    if (query) {
      parts.push(
        query.length > SUBTITLE_QUERY_CHARS ? `${query.slice(0, SUBTITLE_QUERY_CHARS)}…` : query
      );
    }
    return parts;
  }
  if (span.kind === "tool") {
    const service = str(p.service);
    return service ? [service] : [];
  }
  return [];
}

/** The scale's end: the turn's latency, stretched if a step ends after it. */
export function scaleEnd(spans: Span[], latencyMs: number): number {
  const ends = spans.map((s) => s.t0_ms + (num(s.dur_ms) ?? 0));
  return Math.max(latencyMs, ...ends, 1);
}

function depthOf(span: Span, bySeq: Map<number, Span>): number {
  let depth = 0;
  let parent = span.parent_seq;
  const seen = new Set<number>([span.seq]);
  while (parent !== null && bySeq.has(parent) && !seen.has(parent) && depth < MAX_DEPTH) {
    seen.add(parent);
    depth += 1;
    parent = bySeq.get(parent)!.parent_seq;
  }
  return depth;
}

/** The steps grouped under their phase, phases in running order, empty phases left out. */
export function waterfall(spans: Span[], latencyMs: number): PhaseGroup[] {
  const ordered = [...spans].sort((a, b) => a.seq - b.seq);
  const bySeq = new Map(ordered.map((s) => [s.seq, s]));
  const end = scaleEnd(ordered, latencyMs);

  return PHASES.map((phase) => ({
    phase,
    rows: ordered
      .filter((s) => s.phase === phase)
      .map((span) => {
        const start = Math.min(Math.max(span.t0_ms / end, 0), 1);
        const width = Math.min(Math.max((num(span.dur_ms) ?? 0) / end, 0), 1 - start);
        return {
          span,
          depth: depthOf(span, bySeq),
          start,
          width,
          flag: span.level === "default" ? null : span.level,
          subtitle: spanSubtitle(span),
        };
      }),
  })).filter((group) => group.rows.length > 0);
}

/** The bar's position as CSS: a percentage of the track, never under `MIN_BAR_PX`. */
export function barStyle(row: Pick<WaterfallRow, "start" | "width">): { left: string; width: string } {
  const pct = (x: number) => `${Math.round(x * 10_000) / 100}%`;
  return {
    left: `min(${pct(row.start)}, calc(100% - ${MIN_BAR_PX}px))`,
    width: `max(${MIN_BAR_PX}px, ${pct(row.width)})`,
  };
}

/** The element id of a step's row, which the marks and the panels scroll to. */
export function stepId(seq: number): string {
  return `turn-step-${seq}`;
}
