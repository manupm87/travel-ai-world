/**
 * The four numbered marks on the traveller's side (TRA-228), pure: each one
 * sits on something the traveller saw and leads to the section of the
 * inspector that explains it. A mark exists only when both ends do.
 *
 *   ① the answer      → the SSE events
 *   ② the itinerary   → the model output
 *   ③ the first warning → the step that warned, in the waterfall
 *   ④ the cards       → the first city-kb panel
 */

import type { TurnDetail } from "@/services/admin";
import { kbId } from "./retrievals";
import { hasCards, hasItinerary, type TravellerSummary } from "./traveller";
import type { InspectorTab } from "./types";
import { stepId } from "./waterfall";

export type MarkHost = "answer" | "itinerary" | "warning" | "cards";
export type MarkSection = "events" | "model" | "trace" | "kb";

export interface Mark {
  n: 1 | 2 | 3 | 4;
  host: MarkHost;
  section: MarkSection;
  /** The id of the element the mark scrolls to and focuses. */
  target: string;
  /** The phone sheet's tab that holds the target. */
  tab: InspectorTab;
}

/** The section headings' ids (each heading is focusable: `tabIndex={-1}`). */
export const SECTION_IDS = {
  trace: "turn-trace",
  model: "turn-model",
  events: "turn-events",
  brief: "turn-brief",
} as const;

export function turnMarks(turn: TurnDetail, traveller: TravellerSummary): Mark[] {
  const marks: Mark[] = [];
  const spans = [...turn.spans].sort((a, b) => a.seq - b.seq);

  if (traveller.answer.trim() !== "" && turn.timeline.length > 0) {
    marks.push({ n: 1, host: "answer", section: "events", target: SECTION_IDS.events, tab: "events" });
  }
  if (hasItinerary(traveller) && spans.some((s) => s.kind === "llm")) {
    marks.push({ n: 2, host: "itinerary", section: "model", target: SECTION_IDS.model, tab: "model" });
  }
  if (traveller.warnings.length > 0 && spans.length > 0) {
    const warned = spans.find((s) => s.level !== "default");
    marks.push({
      n: 3,
      host: "warning",
      section: "trace",
      target: warned ? stepId(warned.seq) : SECTION_IDS.trace,
      tab: "trace",
    });
  }
  const firstSearch = spans.find((s) => s.kind === "retriever");
  if (hasCards(traveller) && firstSearch) {
    marks.push({ n: 4, host: "cards", section: "kb", target: kbId(firstSearch.seq), tab: "kb" });
  }
  return marks;
}

/** The marks that point into a section, for its heading's small numbers. */
export function marksInto(marks: Mark[], section: MarkSection): Mark[] {
  return marks.filter((m) => m.section === section);
}
