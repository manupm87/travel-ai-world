/**
 * Every model call of a turn as a tab (TRA-228), pure: its label, its output
 * (pretty JSON when it parses, text otherwise) and the validation chips.
 */

import type { PillTone } from "@/components/admin/Pill";
import { num, str, strings, type Span } from "./types";

export type ModelOutput = { kind: "json"; text: string } | { kind: "text"; text: string } | null;

export type ValidationChip =
  | { id: "validated"; tone: PillTone }
  | { id: "repairs"; tone: PillTone; count: number }
  | { id: "dropped"; tone: PillTone; count: number }
  | { id: "prices"; tone: PillTone; count: number };

export interface ModelCallTab {
  seq: number;
  /** The schema's name, or the operation (`chat`) when there is none. */
  label: string;
  /** The day a call planned, read from its name (`day_picks:2`), or `null`. */
  day: number | null;
  output: ModelOutput;
  model: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  ttfcMs: number | null;
  chips: ValidationChip[];
}

/** The day a step name carries at its end (`day_picks:2`, `day 3`), or `null`. */
export function dayFromName(name: string): number | null {
  const match = /(?:^|[:_\s-])(\d{1,2})$/.exec(name);
  return match ? Number(match[1]) : null;
}

/** `text` as pretty JSON when it is an object or an array (fenced or not), else as text. */
export function parseOutput(value: unknown): ModelOutput {
  if (value !== null && typeof value === "object") {
    return { kind: "json", text: JSON.stringify(value, null, 2) };
  }
  if (typeof value !== "string" || value.trim() === "") return null;
  const unfenced = value
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  try {
    const parsed: unknown = JSON.parse(unfenced);
    if (parsed !== null && typeof parsed === "object") {
      return { kind: "json", text: JSON.stringify(parsed, null, 2) };
    }
  } catch {
    // Not JSON: shown as the model wrote it.
  }
  return { kind: "text", text: value };
}

/**
 * The chips under a call's output:
 * - a structured call (one with a schema) is "validated" when its first
 *   answer passed (`attempts === 1` and not `repaired`), else it shows its
 *   repairs (`attempts - 1`, at least one) in gold;
 * - "ids dropped" always, gold when the model invented any;
 * - the turn's stripped prices once, on the last tab.
 */
export function validationChips(span: Span, pricesStripped: number | null): ValidationChip[] {
  const p = span.payload;
  const chips: ValidationChip[] = [];
  if (str(p.schema)) {
    const attempts = num(p.attempts) ?? 1;
    if (attempts <= 1 && p.repaired !== true) chips.push({ id: "validated", tone: "success" });
    else chips.push({ id: "repairs", tone: "gold", count: Math.max(1, attempts - 1) });
  }
  const dropped = strings(p.dropped_ids).length;
  chips.push({ id: "dropped", tone: dropped > 0 ? "gold" : "muted", count: dropped });
  if (pricesStripped !== null) {
    chips.push({ id: "prices", tone: pricesStripped > 0 ? "gold" : "muted", count: pricesStripped });
  }
  return chips;
}

/** One tab per `llm` step, in `seq` order. */
export function modelCalls(spans: Span[], pricesStripped: number): ModelCallTab[] {
  const calls = spans.filter((s) => s.kind === "llm").sort((a, b) => a.seq - b.seq);
  return calls.map((span, index) => {
    const p = span.payload;
    return {
      seq: span.seq,
      label: str(p.schema) ?? str(p.operation) ?? span.name,
      day: dayFromName(span.name),
      output: parseOutput(p.output),
      model: str(p.model),
      inputTokens: num(p.input_tokens),
      outputTokens: num(p.output_tokens),
      ttfcMs: num(p.ttfc_ms),
      chips: validationChips(span, index === calls.length - 1 ? pricesStripped : null),
    };
  });
}
