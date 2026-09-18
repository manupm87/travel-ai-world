/**
 * The planner's wire contract (SSE v2, TRA-142) as the frontend consumes it.
 *
 * TRA-142 defines these as Pydantic models in `ai_api` and exports them through
 * `just contracts`. Until that PR lands, this module is the hand-kept mirror of
 * the ticket's schemas, field for field and snake_case like the wire, so the
 * planner page (TRA-144) can be built against recorded fixtures. Once the
 * generated `ai-api.ts` carries them, replace each declaration by a re-export
 * (`components["schemas"]["OptionCard"]`, ...) and keep the view-model helpers.
 */

import type { components } from "@/types/generated/ai-api";

/** A chat turn as `ai_api` replays it; the same shape `/ai/chat` uses. */
export type ChatMessage = components["schemas"]["ChatMessage"];

/** The five checklist fields the brief must have before a trip is generated. */
export type BriefField = "destination" | "origin" | "travellers" | "dates" | "interests";

export const BRIEF_FIELDS = [
  "destination",
  "origin",
  "dates",
  "travellers",
  "interests",
] as const satisfies readonly BriefField[];

/** `€`, `€€`, `€€€`: the only way a price is ever shown (never a number). */
export type PriceTier = 1 | 2 | 3;

export type Pace = "relaxed" | "balanced" | "intense";

export interface TripBrief {
  destination: string | null;
  origin: string | null;
  /** ISO dates (`YYYY-MM-DD`). */
  start_date: string | null;
  end_date: string | null;
  nights: number | null;
  adults: number | null;
  children: number | null;
  budget_tier: PriceTier | null;
  interests: string[];
  pace: Pace | null;
}

export const EMPTY_BRIEF: TripBrief = {
  destination: null,
  origin: null,
  start_date: null,
  end_date: null,
  nights: null,
  adults: null,
  children: null,
  budget_tier: null,
  interests: [],
  pace: null,
};

export type DayPart = "morning" | "afternoon" | "evening" | "night";

export const DAY_PARTS = ["morning", "afternoon", "evening", "night"] as const satisfies readonly DayPart[];

export interface Slot {
  /** 1-based day number. */
  day: number;
  /** `null` when the server did not pin the option to a part of the day. */
  part: DayPart | null;
}

export type OptionKind =
  | "neighbourhood"
  | "hotel"
  | "experience"
  | "restaurant"
  | "flight"
  | "day_template";

export const OPTION_KINDS = [
  "neighbourhood",
  "hotel",
  "experience",
  "restaurant",
  "flight",
  "day_template",
] as const satisfies readonly OptionKind[];

/**
 * One selectable card, hydrated by the backend from the corpus document
 * `id` refers to. The model only picks ids and writes `why`.
 */
export interface OptionCard {
  id: string;
  title: string;
  subtitle: string | null;
  district: string | null;
  category: string;
  image_url: string | null;
  image_credit: string | null;
  price_tier: PriceTier | null;
  rating_text: string | null;
  hours: string | null;
  lat: number | null;
  lon: number | null;
  why: string;
  source: string;
  source_url: string;
  license: string;
  deep_link: string | null;
}

export type SelectionMode = "single" | "multi";

/** A carousel of options the user can pick from; `group_id` names it in the next turn. */
export interface OptionsGroup {
  group_id: string;
  kind: OptionKind;
  prompt: string;
  slot: Slot | null;
  selection: SelectionMode;
  cards: OptionCard[];
}

export type WarnCode = "too_far" | "closed" | "overloaded_day" | "unverified_price";

export const WARN_CODES = [
  "too_far",
  "closed",
  "overloaded_day",
  "unverified_price",
] as const satisfies readonly WarnCode[];

export interface RouteInfo {
  origin: string;
  destination: string;
  outbound_date: string | null;
  return_date: string | null;
  /** A flight search prefilled with the route; never a price. */
  deep_link: string | null;
}

export interface DayWeather {
  summary: string;
  t_max: number | null;
  t_min: number | null;
  source: string;
}

/** Ops in an `itinerary_patch`, discriminated on `op`. */
export type ItineraryOp =
  | { op: "set_stay"; card: OptionCard }
  | { op: "put_activity"; slot: Slot; card: OptionCard }
  | { op: "remove_activity"; slot: Slot; card_id: string }
  | { op: "set_day_title"; day: number; title: string }
  | ({ op: "set_route" } & RouteInfo)
  | ({ op: "set_weather"; day: number } & DayWeather)
  | { op: "warn"; slot: Slot | null; code: WarnCode; message: string };

export type PlannerEvent =
  | { type: "text"; delta: string }
  | { type: "brief"; brief: TripBrief; missing: BriefField[] }
  | ({ type: "options" } & OptionsGroup)
  | { type: "itinerary_patch"; ops: ItineraryOp[] }
  | { type: "error"; error: string; error_code: string }
  | { type: "done" };

export type PlannerEventType = PlannerEvent["type"];

// ─── The request ──────────────────────────────────────────────────────────────

export interface SelectAction {
  type: "select";
  group_id: string;
  card_ids: string[];
}

export interface RemoveAction {
  type: "remove";
  slot: Slot;
  card_id: string;
}

/** Days → parts → card ids, plus the stay: what the client has, so `ai_api` stays stateless. */
export interface ItinerarySnapshot {
  stay_card_id: string | null;
  days: { day: number; slots: Record<DayPart, string[]> }[];
}

export interface PlannerTurn {
  message: string | null;
  action: SelectAction | RemoveAction | null;
  history: ChatMessage[];
  brief: TripBrief | null;
  itinerary: ItinerarySnapshot | null;
  trip_id: string | null;
}
