/**
 * The planner's wire contract (SSE v2, TRA-142) as the frontend consumes it.
 *
 * `ai_api` defines these as Pydantic models and exports them through
 * `just contracts` into `types/generated/ai-api.ts` (never edit that file by
 * hand; re-run `just contracts` after a backend schema change). This module
 * re-exports the generated schemas under the names the planner UI (TRA-144)
 * already uses, and derives the small view-model helpers from them.
 */

import type { components } from "@/types/generated/ai-api";

/** A chat turn as `ai_api` replays it; the same shape `/ai/chat` uses. */
export type ChatMessage = components["schemas"]["ChatMessage"];

/** A city the planner covers (`GET /ai/planner/cities`): a destination to offer. */
export type PlannerCity = components["schemas"]["PlannerCity"];

/** A city's own description in one language, with the page it comes from (TRA-182). */
export type CityIntro = components["schemas"]["CityIntro"];

// ─── The brief ──────────────────────────────────────────────────────────────

export type TripBrief = components["schemas"]["TripBrief"];

/** The five checklist fields the brief must have before a trip is generated. */
export type BriefField = components["schemas"]["BriefEvent"]["missing"][number];

export const BRIEF_FIELDS = [
  "destination",
  "origin",
  "dates",
  "travellers",
  "interests",
] as const satisfies readonly BriefField[];

/** `€`, `€€`, `€€€`: the only way a price is ever shown (never a number). */
export type PriceTier = NonNullable<components["schemas"]["OptionCard"]["price_tier"]>;

export type Pace = NonNullable<TripBrief["pace"]>;

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

// ─── Slots and options ────────────────────────────────────────────────────────

export type Slot = components["schemas"]["Slot"];

export type DayPart = NonNullable<Slot["part"]>;

export const DAY_PARTS = ["morning", "afternoon", "evening", "night"] as const satisfies readonly DayPart[];

/**
 * One selectable card, hydrated by the backend from the corpus document
 * `id` refers to. The model only picks ids and writes `why`.
 */
export type OptionCard = components["schemas"]["OptionCard"];

/**
 * The same card in full (`GET /ai/planner/card?id=`), as the detail panel
 * shows it: the corpus article behind the card, its address, phone and site.
 *
 * Additive over {@link OptionCard} in shape, but not a replacement for one:
 * `why` is what the model wrote for a turn, so the endpoint returns `""`, and
 * `image_url`/`image_credit` hold the corpus's own photo or one found on
 * Wikimedia Commons — `null` when neither has one, where the streamed card
 * carries a fallback picture. So merge the detail onto the card already held
 * instead of replacing it — keep that card's `why`, and its photo and credit
 * together when the detail brings none:
 * `{ ...card, ...detail, why: card.why, ...(detail.image_url ? {} : { image_url: card.image_url, image_credit: card.image_credit }) }`
 */
export type CardDetail = components["schemas"]["CardDetail"];

export type OptionKind = components["schemas"]["OptionsEvent"]["kind"];

export const OPTION_KINDS = [
  "neighbourhood",
  "hotel",
  "experience",
  "restaurant",
  "flight",
  "day_template",
] as const satisfies readonly OptionKind[];

export type SelectionMode = components["schemas"]["OptionsEvent"]["selection"];

/** A carousel of options the user can pick from; `group_id` names it in the next turn. */
export type OptionsGroup = Omit<components["schemas"]["OptionsEvent"], "type">;

// ─── Itinerary ops ────────────────────────────────────────────────────────────

export type WarnCode = components["schemas"]["WarnOp"]["code"];

export const WARN_CODES = [
  "too_far",
  "closed",
  "overloaded_day",
  "unverified_price",
] as const satisfies readonly WarnCode[];

export type RouteInfo = Omit<components["schemas"]["SetRouteOp"], "op">;

export type DayWeather = Omit<components["schemas"]["SetWeatherOp"], "op" | "day">;

/** Ops in an `itinerary_patch`, discriminated on `op`. */
export type ItineraryOp = components["schemas"]["ItineraryOp"];

// ─── Events ─────────────────────────────────────────────────────────────────

export type PlannerEvent = components["schemas"]["PlannerEvent"];

export type PlannerEventType = PlannerEvent["type"];

// ─── The request ──────────────────────────────────────────────────────────────

export type SelectAction = components["schemas"]["SelectAction"];

export type RemoveAction = components["schemas"]["RemoveAction"];

/** Days → parts → card ids, plus the stay: what the client has, so `ai_api` stays stateless. */
export type ItinerarySnapshot = components["schemas"]["ItinerarySnapshot"];

/** One turn as the app sends it: every key present, `null` when unknown. */
export type PlannerTurn = components["schemas"]["PlannerTurn"];
