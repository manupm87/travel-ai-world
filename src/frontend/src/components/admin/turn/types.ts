import type { TurnDetail } from "@/services/admin";

/** One step of a turn, as the admin API returns it. */
export type Span = TurnDetail["spans"][number];
export type SpanKind = Span["kind"];
export type Phase = Span["phase"];
/** One document a retrieval returned. */
export type RetrievedDoc = Span["results"][number];
/** One SSE mark of the turn's timeline. */
export type EventMark = TurnDetail["timeline"][number];
export type TurnContext = TurnDetail["context"];

/** The phone sheet's four tabs; every section of the inspector lives under one. */
export type InspectorTab = "trace" | "kb" | "model" | "events";

/** Moves the reader to a section (by element id), opening the sheet's tab on a phone. */
export type Navigate = (targetId: string, tab: InspectorTab) => void;

/** A scalar from an untyped payload, or `null`. */
export function str(value: unknown): string | null {
  return typeof value === "string" && value !== "" ? value : null;
}

export function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string" && v !== "") : [];
}
