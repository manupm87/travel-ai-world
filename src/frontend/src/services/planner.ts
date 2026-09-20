/**
 * The trip planner against ai_api (`POST /api/v1/ai/planner`, Server-Sent
 * Events, typed events: SSE v2).
 */

import type {
  BriefField,
  CardDetail,
  DayPart,
  ItineraryOp,
  OptionCard,
  OptionKind,
  PlannerCity,
  PlannerEvent,
  PlannerTurn,
  Slot,
  TripBrief,
  WarnCode,
} from "@/types/planner";
import {
  BRIEF_FIELDS,
  DAY_PARTS,
  EMPTY_BRIEF,
  OPTION_KINDS,
  WARN_CODES,
} from "@/types/planner";
import { ApiError, isAiAvailable, request, requestRaw } from "./http";
import { streamDemoTurn } from "./plannerDemo";

export interface ParsedPlannerEvents {
  events: PlannerEvent[];
  /** Trailing partial line, to be prepended to the next chunk. */
  rest: string;
}

type Json = Record<string, unknown>;

function isObject(value: unknown): value is Json {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// Widened to `string[]` so `includes` can test unknown wire values.
const BRIEF_FIELD_NAMES: readonly string[] = BRIEF_FIELDS;
const OPTION_KIND_NAMES: readonly string[] = OPTION_KINDS;
const DAY_PART_NAMES: readonly string[] = DAY_PARTS;
const WARN_CODE_NAMES: readonly string[] = WARN_CODES;

/** Fills the brief's shape so components never meet a missing key. */
function toBrief(raw: unknown): TripBrief {
  if (!isObject(raw)) return EMPTY_BRIEF;
  const brief = { ...EMPTY_BRIEF, ...raw } as TripBrief;
  return { ...brief, interests: Array.isArray(brief.interests) ? brief.interests : [] };
}

function toSlot(raw: unknown): Slot | null {
  if (!isObject(raw) || typeof raw.day !== "number") return null;
  const part = typeof raw.part === "string" && DAY_PART_NAMES.includes(raw.part) ? raw.part : null;
  return { day: raw.day, part: part as DayPart | null };
}

/** A card needs an id (the corpus document) and a title; the rest defaults. */
function toOptionCard(raw: unknown): OptionCard | null {
  if (!isObject(raw) || typeof raw.id !== "string" || typeof raw.title !== "string") return null;
  const str = (key: string): string | null =>
    typeof raw[key] === "string" ? (raw[key] as string) : null;
  const num = (key: string): number | null =>
    typeof raw[key] === "number" ? (raw[key] as number) : null;
  const tier = raw.price_tier;
  return {
    id: raw.id,
    title: raw.title,
    subtitle: str("subtitle"),
    district: str("district"),
    category: str("category") ?? "",
    image_url: str("image_url"),
    image_credit: str("image_credit"),
    price_tier: tier === 1 || tier === 2 || tier === 3 ? tier : null,
    rating_text: str("rating_text"),
    hours: str("hours"),
    lat: num("lat"),
    lon: num("lon"),
    why: str("why") ?? "",
    source: str("source") ?? "",
    source_url: str("source_url") ?? "",
    license: str("license") ?? "",
    deep_link: str("deep_link"),
  };
}

/**
 * One itinerary op, or `null` when its required fields are not there: a
 * malformed op must be dropped here, not crash the reducer mid-render.
 */
function toItineraryOp(raw: unknown): ItineraryOp | null {
  if (!isObject(raw) || typeof raw.op !== "string") return null;
  const str = (key: string): string | null =>
    typeof raw[key] === "string" ? (raw[key] as string) : null;
  const num = (key: string): number | null =>
    typeof raw[key] === "number" && Number.isFinite(raw[key]) ? (raw[key] as number) : null;
  switch (raw.op) {
    case "set_stay": {
      const card = toOptionCard(raw.card);
      return card ? { op: "set_stay", card } : null;
    }
    case "put_activity": {
      const slot = toSlot(raw.slot);
      const card = toOptionCard(raw.card);
      return slot && card ? { op: "put_activity", slot, card } : null;
    }
    case "remove_activity": {
      const slot = toSlot(raw.slot);
      const cardId = str("card_id");
      return slot && cardId ? { op: "remove_activity", slot, card_id: cardId } : null;
    }
    case "set_day_title": {
      const day = num("day");
      const title = str("title");
      return day !== null && title !== null ? { op: "set_day_title", day, title } : null;
    }
    case "set_route": {
      const origin = str("origin");
      const destination = str("destination");
      if (origin === null || destination === null) return null;
      return {
        op: "set_route",
        origin,
        destination,
        outbound_date: str("outbound_date"),
        return_date: str("return_date"),
        deep_link: str("deep_link"),
      };
    }
    case "set_weather": {
      const day = num("day");
      const summary = str("summary");
      if (day === null || summary === null) return null;
      return {
        op: "set_weather",
        day,
        summary,
        t_max: num("t_max"),
        t_min: num("t_min"),
        source: str("source") ?? "",
      };
    }
    case "warn": {
      const code = str("code");
      if (code === null || !WARN_CODE_NAMES.includes(code)) return null;
      return {
        op: "warn",
        slot: raw.slot === null || raw.slot === undefined ? null : toSlot(raw.slot),
        code: code as WarnCode,
        message: str("message") ?? "",
      };
    }
    default:
      return null; // an op this build does not know: ignore
  }
}

/**
 * Turns one decoded `data:` payload into an event, or `null` when it is not
 * one we understand. Tolerant on purpose: a new event type or a malformed
 * payload must not break the stream, and the legacy `{"content"}` /
 * `{"error"}` lines of `/ai/chat` still map to `text` / `error`.
 */
export function toPlannerEvent(parsed: unknown): PlannerEvent | null {
  if (!isObject(parsed)) return null;

  if (typeof parsed.type !== "string") {
    if (typeof parsed.error === "string" && parsed.error) {
      return { type: "error", error: parsed.error, error_code: "upstream_error" };
    }
    if (typeof parsed.content === "string" && parsed.content) {
      return { type: "text", delta: parsed.content };
    }
    return null;
  }

  switch (parsed.type) {
    case "text":
      return typeof parsed.delta === "string" && parsed.delta
        ? { type: "text", delta: parsed.delta }
        : null;
    case "brief": {
      const missing = Array.isArray(parsed.missing)
        ? parsed.missing.filter(
            (f, i, all): f is BriefField =>
              typeof f === "string" && BRIEF_FIELD_NAMES.includes(f) && all.indexOf(f) === i
          )
        : [];
      return { type: "brief", brief: toBrief(parsed.brief), missing };
    }
    case "options": {
      if (typeof parsed.group_id !== "string" || !Array.isArray(parsed.cards)) return null;
      const kind =
        typeof parsed.kind === "string" && OPTION_KIND_NAMES.includes(parsed.kind)
          ? (parsed.kind as OptionKind)
          : "experience";
      return {
        type: "options",
        group_id: parsed.group_id,
        kind,
        prompt: typeof parsed.prompt === "string" ? parsed.prompt : "",
        slot: toSlot(parsed.slot),
        selection: parsed.selection === "multi" ? "multi" : "single",
        cards: parsed.cards.map(toOptionCard).filter((c): c is OptionCard => c !== null),
      };
    }
    case "itinerary_patch":
      if (!Array.isArray(parsed.ops)) return null;
      return {
        type: "itinerary_patch",
        ops: parsed.ops.map(toItineraryOp).filter((op): op is ItineraryOp => op !== null),
      };
    case "error":
      return {
        type: "error",
        error: typeof parsed.error === "string" ? parsed.error : "",
        error_code: typeof parsed.error_code === "string" ? parsed.error_code : "upstream_error",
      };
    case "done":
      return { type: "done" };
    default:
      return null; // an event type this build does not know: ignore
  }
}

/**
 * Parses the complete lines of an SSE buffer into typed planner events. Pure.
 *
 * Wire format, one JSON object per `data:` line, terminated by `[DONE]`:
 *   data: {"type": "text", "delta": "Hola"}
 *   data: {"type": "options", "group_id": "g1", ...}
 *   data: [DONE]
 *
 * Non-`data:` lines and malformed JSON are skipped; unknown `type`s are
 * ignored; the last line comes back as `rest` when the chunk was cut
 * mid-line. Parsing stops at `[DONE]`, which becomes a `done` event.
 */
export function parsePlannerEvents(buffer: string): ParsedPlannerEvents {
  const lines = buffer.split("\n");
  const rest = lines.pop() ?? "";
  const events: PlannerEvent[] = [];

  for (const line of lines) {
    if (!line.startsWith("data:")) continue;
    const data = line.slice(5).trim();
    if (data === "[DONE]") {
      events.push({ type: "done" });
      return { events, rest: "" };
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(data);
    } catch {
      continue; // malformed chunk: skip
    }
    const event = toPlannerEvent(parsed);
    if (event) events.push(event);
  }

  return { events, rest };
}

export interface StreamPlannerOptions {
  /** Abort the request and stop reading the stream. */
  signal?: AbortSignal;
  /**
   * Called once when the turn is answered by the synthetic session instead
   * of ai_api (no backend configured, or `/planner` not deployed yet: TRA-158).
   */
  onDemo?: () => void;
}

/** A 404/405 from the planner route means it is not deployed: not a failure. */
function isRouteMissing(err: unknown): boolean {
  return err instanceof ApiError && (err.status === 404 || err.status === 405);
}

/**
 * The cities the planner covers (`GET /ai/planner/cities`), for the
 * destination hint and the starter chips. Empty when there is no ai_api
 * URL; the page keeps its built-in copy then. Failures propagate (the hook
 * turns them into the same empty list).
 */
export async function listCities(options?: { signal?: AbortSignal }): Promise<PlannerCity[]> {
  if (!isAiAvailable()) return [];
  const cities = await request<unknown>("ai", "/ai/planner/cities", {
    auth: true,
    signal: options?.signal,
  });
  if (!Array.isArray(cities)) return [];
  return cities
    .filter(
      (city): city is Json =>
        isObject(city) && typeof city.slug === "string" && typeof city.name === "string"
    )
    .map(toPlannerCity);
}

/**
 * The trip overview's fields (TRA-182) are required on the type, but a backend
 * deployed before them answers without: the frontend ships on merge, the
 * service by hand later. Fill them rather than hand the page `undefined`.
 */
function toPlannerCity(city: Json): PlannerCity {
  return {
    ...(city as unknown as PlannerCity),
    intro: isObject(city.intro) ? (city.intro as PlannerCity["intro"]) : {},
    image_url: typeof city.image_url === "string" ? city.image_url : null,
    image_credit: typeof city.image_credit === "string" ? city.image_credit : null,
  };
}

/** A card detail needs an id and a title; every other field defaults. */
function toCardDetail(raw: unknown): CardDetail | null {
  const card = toOptionCard(raw);
  if (!card || !isObject(raw)) return null;
  const str = (key: string): string | null =>
    typeof raw[key] === "string" ? (raw[key] as string) : null;
  return {
    ...card,
    description: str("description") ?? "",
    heading_path: str("heading_path"),
    address: str("address"),
    phone: str("phone"),
    website: str("website"),
  };
}

/**
 * One card in full (`GET /ai/planner/card?id=`), for the detail panel: the
 * corpus article behind the card, its address, phone and site.
 *
 * `null` — never an error — whenever the detail simply cannot be had: no
 * ai_api URL (the static export), the route not deployed yet, or an id the
 * corpus no longer holds (404). The panel then shows what the card itself
 * carries, which is what demo mode always does. Every other failure throws,
 * so the hook can tell "nothing to add" from "something went wrong".
 */
export async function getCardDetail(
  id: string,
  options?: { signal?: AbortSignal }
): Promise<CardDetail | null> {
  if (!isAiAvailable()) return null;
  try {
    const detail = await request<unknown>(
      "ai",
      `/ai/planner/card?id=${encodeURIComponent(id)}`,
      { auth: true, signal: options?.signal }
    );
    return toCardDetail(detail);
  } catch (err) {
    if (isRouteMissing(err)) return null;
    throw err;
  }
}

/**
 * Streams one planner turn. Yields every typed event as it arrives, the
 * `done` event last; the generator returns after `done` or when the body
 * ends. Throws `UnauthorizedError` on 401 and `ApiError` on other failures;
 * an in-stream `error` event is yielded, not thrown, so the caller decides.
 */
export async function* streamPlannerTurn(
  turn: PlannerTurn,
  { signal, onDemo }: StreamPlannerOptions = {}
): AsyncGenerator<PlannerEvent, void, unknown> {
  if (!isAiAvailable()) {
    onDemo?.();
    yield* streamDemoTurn(turn, { signal });
    return;
  }

  let res: Response;
  try {
    res = await requestRaw("ai", "/ai/planner", {
      method: "POST",
      json: turn,
      auth: true,
      signal,
    });
  } catch (err) {
    if (!isRouteMissing(err)) throw err;
    onDemo?.();
    yield* streamDemoTurn(turn, { signal });
    return;
  }

  const reader = res.body?.getReader();
  if (!reader) throw new Error("No response body");

  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const { events, rest } = parsePlannerEvents(
        buffer + decoder.decode(value, { stream: true })
      );
      buffer = rest;

      for (const event of events) {
        yield event;
        if (event.type === "done") return;
      }
    }
  } finally {
    reader.releaseLock();
  }
}
