/**
 * One city-kb panel per retrieval (TRA-228), pure: the filters that were set
 * as chips, the purpose as an i18n key, and the results with their distance
 * scaled over the panel's farthest one.
 */

import { num, record, str, strings, type RetrievedDoc, type Span } from "./types";

export type FilterChip =
  | { key: "city"; value: string }
  | { key: "category"; value: string[] }
  | { key: "district"; value: string[] }
  | { key: "kind"; value: string[] }
  | { key: "price"; value: number };

export type DayPart = "morning" | "afternoon" | "evening" | "night";

export type Purpose =
  | { key: "candidatesDay"; day: number; part: DayPart }
  | {
      key:
        | "neighbourhoods"
        | "candidates"
        | "hotels"
        | "named"
        | "chat"
        | "climate"
        | "fetch"
        | "photos";
    }
  | { key: "other"; raw: string };

export interface ResultRow {
  doc: RetrievedDoc;
  /** The distance over the panel's largest, 0..1; 0 when unknown. */
  bar: number;
}

export interface RetrievalView {
  seq: number;
  purpose: Purpose | null;
  query: string | null;
  chips: FilterChip[];
  k: number | null;
  ladderStep: number | null;
  embeddingModel: string | null;
  rows: ResultRow[];
  used: number;
  noHit: boolean;
}

const SIMPLE = new Set([
  "neighbourhoods",
  "candidates",
  "hotels",
  "named",
  "chat",
  "climate",
  "fetch",
  "photos",
]);
const PARTS = new Set<string>(["morning", "afternoon", "evening", "night"]);

/** `candidates:2:afternoon` → candidates for day 2, afternoon; the rest by name. */
export function parsePurpose(value: unknown): Purpose | null {
  const raw = str(value);
  if (!raw) return null;
  const [head, day, part] = raw.split(":");
  if (head === "candidates" && day && part && /^\d+$/.test(day) && PARTS.has(part)) {
    return { key: "candidatesDay", day: Number(day), part: part as DayPart };
  }
  if (head && SIMPLE.has(head)) return { key: head as Exclude<Purpose, { key: "candidatesDay" | "other" }>["key"] };
  return { key: "other", raw };
}

/** The filters that were set, as chips: empty lists and `null`s are left out. */
export function filterChips(filters: unknown): FilterChip[] {
  const f = record(filters);
  if (!f) return [];
  const chips: FilterChip[] = [];
  const city = str(f.city);
  if (city) chips.push({ key: "city", value: city });
  const categories = strings(f.categories);
  if (categories.length) chips.push({ key: "category", value: categories });
  const districts = strings(f.districts);
  if (districts.length) chips.push({ key: "district", value: districts });
  const kinds = strings(f.kinds);
  if (kinds.length) chips.push({ key: "kind", value: kinds });
  const price = num(f.price_tier_max);
  if (price !== null) chips.push({ key: "price", value: price });
  return chips;
}

/** The results with their bar: each distance over the largest in the panel. */
export function resultRows(results: RetrievedDoc[]): ResultRow[] {
  const ordered = [...results].sort((a, b) => a.rank - b.rank);
  const max = Math.max(0, ...ordered.map((d) => d.distance ?? 0));
  return ordered.map((doc) => ({
    doc,
    bar: max > 0 && doc.distance !== null ? Math.min(doc.distance / max, 1) : 0,
  }));
}

/** One view per `retriever` step, in `seq` order. */
export function retrievalViews(spans: Span[]): RetrievalView[] {
  return spans
    .filter((s) => s.kind === "retriever")
    .sort((a, b) => a.seq - b.seq)
    .map((span) => {
      const p = span.payload;
      return {
        seq: span.seq,
        purpose: parsePurpose(p.purpose),
        query: str(p.query),
        chips: filterChips(p.filters),
        k: num(p.k),
        ladderStep: num(p.ladder_step),
        embeddingModel: str(p.embedding_model),
        rows: resultRows(span.results),
        used: span.results.filter((d) => d.used).length,
        noHit: span.results.length === 0,
      };
    });
}

/** Retrievals that fetched documents by id rather than searching. */
export function fetchCount(spans: Span[]): number {
  return spans.filter((s) => s.kind === "retriever" && s.payload.purpose === "fetch").length;
}

/** The element id of a retrieval's panel. */
export function kbId(seq: number): string {
  return `turn-kb-${seq}`;
}
