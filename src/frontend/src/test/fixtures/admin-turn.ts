/**
 * The turn inspector's test doubles (TRA-228): one rich planner turn shaped
 * like the design board "Chat en modo admin" — the traveller chooses to sleep
 * in Erzsébetváros and the planner lays out four days in Budapest — and one
 * minimal chat turn with no session. Typed by the generated schemas through
 * `services/admin.ts` with `satisfies`, so a contract change breaks them
 * first. Shared by the Vitest suites and `e2e/admin-turn.spec.ts`.
 */

import type { TurnDetail, TurnPage } from "@/services/admin";
import { turnSummary } from "./admin";

type Span = TurnDetail["spans"][number];
type Doc = Span["results"][number];

export const INSPECTOR_TURN_ID = "01J8TURN00000000000000INSP";
export const INSPECTOR_SESSION_ID = "sess-budapest-oct";
export const CHAT_TURN_ID = "01J8TURN00000000000000CHAT";
export const EMBEDDING_MODEL = "amazon.titan-embed-text-v2:0";
const MODEL = "claude-haiku-4-5";

// ─── Spans ──────────────────────────────────────────────────────────────────

const LLM_DEFAULTS = {
  provider: "bedrock",
  model: MODEL,
  operation: "structured",
  schema: null as string | null,
  prompt_version: "3f9a1c0b7d2e",
  temperature: 0.4,
  max_tokens: 1200,
  input_tokens: 0,
  output_tokens: 0,
  ttfc_ms: null as number | null,
  attempts: 1,
  repaired: false,
  validation_error: null as string | null,
  picked_ids: [] as string[],
  dropped_ids: [] as string[],
  input: "",
  output: "",
  input_truncated: false,
  output_truncated: false,
};

function span(
  seq: number,
  kind: Span["kind"],
  name: string,
  phase: Span["phase"],
  t0_ms: number,
  dur_ms: number,
  extra: Partial<Span> = {}
): Span {
  return {
    seq,
    parent_seq: null,
    kind,
    name,
    phase,
    t0_ms,
    dur_ms,
    level: "default",
    message: null,
    payload: {},
    results: [],
    ...extra,
  };
}

/** Places in Budapest a search can return, by the part of the day they suit. */
const PLACES: [string, string, string, string][] = [
  ["wv:en:Budapest/Városliget#do:szechenyi-thermal-bath", "Széchenyi Thermal Bath", "do", "Városliget"],
  ["wv:en:Budapest/South Buda#see:gellert-hotel-and-bath", "Gellért Hotel and Bath", "see", "South Buda"],
  ["wv:en:Budapest/Víziváros#do:rudas-thermal-bath", "Rudas Thermal Bath", "do", "Víziváros"],
  ["wv:en:Budapest/Erzsébetváros#see:gozsdu-yard-complex", "Gozsdu Yard Complex", "see", "Erzsébetváros"],
  ["wv:en:Budapest/Belváros#see:great-market-hall", "Great Market Hall", "see", "Belváros"],
  ["wv:en:Budapest/Várnegyed#see:fishermans-bastion", "Fisherman's Bastion", "see", "Várnegyed"],
  ["wv:en:Budapest/Lipótváros#see:hungarian-parliament", "Hungarian Parliament Building", "see", "Lipótváros"],
  ["wv:en:Budapest/Erzsébetváros#drink:szimpla-kert", "Szimpla Kert", "drink", "Erzsébetváros"],
  ["wv:en:Budapest/Terézváros#see:house-of-terror", "House of Terror", "see", "Terézváros"],
  ["wv:en:Budapest/Lipótváros#see:st-stephens-basilica", "St. Stephen's Basilica", "see", "Lipótváros"],
  ["wv:en:Budapest/Óbuda#do:aquincum-museum", "Aquincum Museum", "do", "Óbuda"],
  ["wv:en:Budapest/Várnegyed#eat:21-magyar-vendeglo", "21 Magyar Vendéglő", "eat", "Várnegyed"],
];

/** Eight documents from `offset`, distances rising from `start`, the first `used` of them used. */
function results(offset: number, start: number, used: number): Doc[] {
  return Array.from({ length: 8 }, (_, rank) => {
    const [doc_id, title, category, district] = PLACES[(offset + rank) % PLACES.length]!;
    return {
      doc_id,
      title,
      category,
      district,
      distance: Math.round((start + rank * 0.023) * 1000) / 1000,
      rank,
      used: rank < used,
    };
  });
}

function candidates(
  seq: number,
  day: number,
  part: "morning" | "afternoon" | "evening",
  t0: number,
  dur: number,
  categories: string[],
  offset: number,
  used: number
): Span {
  return span(seq, "retriever", `search:candidates:${day}:${part}`, "fold", t0, dur, {
    payload: {
      purpose: `candidates:${day}:${part}`,
      query: `thermal baths and food in Budapest, ${part} of day ${day}, balanced pace`,
      filters: {
        city: "budapest",
        districts: day === 2 ? ["Városliget"] : [],
        categories,
        kinds: [],
        price_tier_max: day === 4 ? 2 : null,
        bbox: null,
      },
      k: 8,
      ladder_step: day === 3 && part === "afternoon" ? 1 : null,
      embedding_model: EMBEDDING_MODEL,
      embed_tokens: 18,
      n_results: 8,
      no_hit: false,
    },
    results: results(offset, 0.412, used),
  });
}

function dayPicks(seq: number, day: number, t0: number, dur: number, extra: Record<string, unknown> = {}): Span {
  const output = {
    morning: [],
    afternoon: [
      {
        id: PLACES[day % PLACES.length]![0],
        why: "Open-air baths: pleasant even in October rain.",
      },
    ],
    evening: [],
    night: [],
  };
  return span(seq, "llm", `day_picks:${day}`, "fold", t0, dur, {
    payload: {
      ...LLM_DEFAULTS,
      schema: "DayPicks",
      input_tokens: 2100,
      output_tokens: 310,
      picked_ids: [PLACES[day % PLACES.length]![0]],
      input: `Pick the activities of day ${day} from the candidates.`,
      output: JSON.stringify(output),
      ...extra,
    },
  });
}

const SPANS: Span[] = [
  // Open the suitcase
  span(1, "chain", "read_turn", "open", 0, 4, {
    payload: { details: { action: "select", language: "en" } },
  }),
  span(2, "retriever", "fetch:fetch", "open", 4, 120, {
    payload: {
      purpose: "fetch",
      query: "wv:en:Budapest/Erzsébetváros#sleep:hotel-moments",
      filters: null,
      k: 1,
      ladder_step: null,
      embedding_model: EMBEDDING_MODEL,
      embed_tokens: 0,
      n_results: 1,
      no_hit: false,
    },
    results: [
      {
        doc_id: "wv:en:Budapest/Erzsébetváros#sleep:hotel-moments",
        title: "Hotel Moments Budapest",
        category: "sleep",
        district: "Erzsébetváros",
        distance: null,
        rank: 0,
        used: true,
      },
    ],
  }),
  span(3, "tool", "flights", "open", 124, 10, {
    payload: { service: "flights", host: "www.skyscanner.net", status: "ok", count: 1 },
  }),
  // Look in the wardrobe
  span(4, "tool", "weather_by_day", "wardrobe", 140, 640, {
    payload: { service: "open-meteo", host: "api.open-meteo.com", status: "ok", count: 4 },
  }),
  span(5, "llm", "skeleton", "wardrobe", 150, 2100, {
    payload: {
      ...LLM_DEFAULTS,
      schema: "Skeleton",
      input_tokens: 1880,
      output_tokens: 420,
      input: "Four days in Budapest in October, thermal baths and wine.",
      output: JSON.stringify({
        days: [
          { day: 1, title: "Pest and the market" },
          { day: 2, title: "Baths in Városliget" },
          { day: 3, title: "Castle Hill" },
          { day: 4, title: "Óbuda and the river" },
        ],
      }),
    },
  }),
  // Fold and fit
  candidates(6, 1, "afternoon", 2260, 190, ["see", "do"], 4, 2),
  candidates(7, 1, "evening", 2260, 190, ["eat", "drink"], 7, 1),
  dayPicks(8, 1, 2460, 1600),
  candidates(9, 2, "morning", 2270, 170, ["see", "do", "tour", "history"], 0, 2),
  candidates(10, 2, "afternoon", 2270, 170, ["see", "do", "tour", "history"], 0, 3),
  dayPicks(11, 2, 4100, 1600, {
    attempts: 2,
    repaired: true,
    validation_error: "afternoon.0.id: Field required",
    input_tokens: 4020,
    output_tokens: 560,
  }),
  candidates(12, 3, "morning", 2280, 180, ["see", "history"], 5, 1),
  candidates(13, 3, "afternoon", 2280, 180, ["see", "do"], 9, 2),
  dayPicks(14, 3, 5750, 1500, { dropped_ids: ["wv:en:Budapest/Invented#see:nowhere"] }),
  candidates(15, 4, "morning", 2290, 155, ["see", "do"], 10, 1),
  candidates(16, 4, "afternoon", 2290, 155, ["eat", "see"], 2, 2),
  dayPicks(17, 4, 7300, 1400),
  // Weigh the suitcase
  span(18, "chain", "validate_day", "weigh", 9820, 20, {
    level: "warning",
    message: "Day 2 has more activities than the balanced pace allows (4).",
    payload: { details: { day: 2, warnings: ["overloaded_day"] } },
  }),
  span(19, "chain", "strip_prices", "weigh", 9840, 2, {
    payload: { details: { day: 3, stripped: 2 } },
  }),
  span(20, "chain", "photos", "weigh", 9850, 840, {
    payload: { details: { cards: 11, with_photo: 10 } },
  }),
  span(21, "tool", "commons", "weigh", 9860, 800, {
    parent_seq: 20,
    payload: { service: "commons", host: "commons.wikimedia.org", status: "ok", count: 10 },
  }),
  // Zip it up
  span(22, "chain", "closing_text", "zip", 10740, 440, {
    payload: { details: { fixed: true } },
  }),
];

// ─── The rich turn ──────────────────────────────────────────────────────────

const card = (index: number) => ({ id: PLACES[index]![0], title: PLACES[index]![1] });
const put = (day: number, part: string, index: number) => ({
  op: "put_activity",
  slot: { day, part },
  card: card(index),
});

export const INSPECTOR_TURN = {
  summary: turnSummary({
    turn_id: INSPECTOR_TURN_ID,
    ts: "2026-09-22T16:42:00Z",
    day: "2026-09-22",
    sk: `2026-09-22T16:42:00Z#${INSPECTOR_TURN_ID}`,
    session_id: INSPECTOR_SESSION_ID,
    action: "select:hotels:erzsebetvaros",
    model: MODEL,
    provider: "bedrock",
    llm_calls: 5,
    retrievals: 9,
    docs_retrieved: 65,
    docs_used: 15,
    repairs: 1,
    dropped_ids: 1,
    prices_stripped: 2,
    warnings: 1,
    input_tokens: 12_480,
    output_tokens: 1_930,
    cost_usd: 0.0214,
    latency_ms: 11_200,
    first_event_ms: 130,
    question_preview: "select:hotels:erzsebetvaros",
    answer_preview: "You now have the four days on the map.",
    events: { itinerary_patch: 8, text: 5, brief: 1, done: 1 },
    ops: { set_stay: 1, set_route: 1, set_day_title: 4, put_activity: 11, set_weather: 4, warn: 1 },
  }),
  context: {
    message: null,
    action: {
      type: "select",
      group_id: "hotels:erzsebetvaros",
      card_ids: ["wv:en:Budapest/Erzsébetváros#sleep:hotel-moments"],
      slot: null,
    },
    brief: {
      destination: "Budapest",
      origin: "Madrid",
      start_date: "2026-10-12",
      nights: 3,
      adults: 2,
      children: 0,
      budget_tier: 2,
      interests: ["thermal_baths", "food"],
      pace: "balanced",
      missing: [],
    },
    history: [],
    itinerary_ids: [],
    exclude_card_ids: [],
    ops: [
      {
        op: "set_stay",
        card: { id: "wv:en:Budapest/Erzsébetváros#sleep:hotel-moments", title: "Hotel Moments Budapest" },
      },
      {
        op: "set_route",
        origin: "Madrid",
        destination: "Budapest",
        outbound_date: "2026-10-12",
        return_date: "2026-10-15",
        deep_link: "https://www.skyscanner.net/",
      },
      { op: "set_day_title", day: 1, title: "Pest and the market" },
      { op: "set_day_title", day: 2, title: "Baths in Városliget" },
      { op: "set_day_title", day: 3, title: "Castle Hill" },
      { op: "set_day_title", day: 4, title: "Óbuda and the river" },
      put(1, "afternoon", 4),
      put(1, "evening", 7),
      put(1, "night", 3),
      put(2, "morning", 0),
      put(2, "afternoon", 8),
      put(2, "evening", 11),
      put(3, "morning", 5),
      put(3, "afternoon", 9),
      put(3, "evening", 1),
      put(4, "morning", 10),
      put(4, "afternoon", 2),
      { op: "set_weather", day: 1, source: "open-meteo", summary: "Cloudy", t_max: 17, t_min: 9 },
      { op: "set_weather", day: 2, source: "open-meteo", summary: "Light rain", t_max: 15, t_min: 8 },
      { op: "set_weather", day: 3, source: "open-meteo", summary: "Sunny", t_max: 18, t_min: 7 },
      { op: "set_weather", day: 4, source: "climate", summary: "Mild", t_max: 16, t_min: 8 },
      {
        op: "warn",
        code: "overloaded_day",
        message: "Day 2 is very full for a balanced pace.",
        slot: { day: 2, part: null },
      },
    ],
    option_groups: [],
    answer_text:
      "You now have the four days on the map. **Day 2 is full**: if you like, I'll lighten it.",
    truncated: false,
  },
  spans: SPANS,
  timeline: [
    { t_ms: 130, type: "itinerary_patch", summary: "set_stay, set_route", bytes: 820, count: 1 },
    { t_ms: 2250, type: "itinerary_patch", summary: "set_day_title ×4", bytes: 310, count: 1 },
    { t_ms: 4210, type: "itinerary_patch", summary: "put_activity ×3", bytes: 2100, count: 1 },
    { t_ms: 6220, type: "itinerary_patch", summary: "put_activity ×3", bytes: 2050, count: 1 },
    { t_ms: 8050, type: "itinerary_patch", summary: "put_activity ×2", bytes: 1400, count: 1 },
    { t_ms: 9860, type: "itinerary_patch", summary: "put_activity ×3", bytes: 2150, count: 1 },
    { t_ms: 9900, type: "itinerary_patch", summary: "warn overloaded_day", bytes: 180, count: 1 },
    { t_ms: 10_740, type: "itinerary_patch", summary: "set_weather ×4", bytes: 520, count: 1 },
    { t_ms: 10_760, type: "text", summary: "", bytes: 96, count: 3 },
    { t_ms: 10_790, type: "brief", summary: "missing: ", bytes: 40, count: 1 },
    { t_ms: 10_810, type: "text", summary: "", bytes: 64, count: 2 },
    { t_ms: 11_190, type: "done", summary: "end", bytes: 16, count: 1 },
  ],
} satisfies TurnDetail;

/** The session the rich turn belongs to: three turns, the fixture second. */
export const INSPECTOR_SESSION_PAGE = {
  items: [
    turnSummary({
      turn_id: "01J8TURN00000000000000SES1",
      ts: "2026-09-22T16:38:10Z",
      session_id: INSPECTOR_SESSION_ID,
    }),
    INSPECTOR_TURN.summary,
    turnSummary({
      turn_id: "01J8TURN00000000000000SES3",
      ts: "2026-09-22T16:45:30Z",
      session_id: INSPECTOR_SESSION_ID,
      action: "message",
    }),
  ],
  next_cursor: null,
} satisfies TurnPage;

// ─── The minimal chat turn ──────────────────────────────────────────────────

export const CHAT_TURN = {
  summary: turnSummary({
    turn_id: CHAT_TURN_ID,
    ts: "2026-09-22T17:05:00Z",
    day: "2026-09-22",
    sk: `2026-09-22T17:05:00Z#${CHAT_TURN_ID}`,
    kind: "chat",
    route: "/api/v1/ai/chat",
    session_id: null,
    action: null,
    model: MODEL,
    provider: "bedrock",
    llm_calls: 1,
    retrievals: 1,
    docs_retrieved: 3,
    docs_used: 0,
    input_tokens: 900,
    output_tokens: 120,
    latency_ms: 2_400,
    first_event_ms: 700,
    question_preview: "Is Széchenyi open on Mondays?",
    answer_preview: "Yes, every day from 7:00.",
    events: { text: 20, done: 1 },
    ops: {},
  }),
  context: {
    message: "Is Széchenyi open on Mondays?",
    action: null,
    brief: null,
    history: [],
    itinerary_ids: [],
    exclude_card_ids: [],
    ops: [],
    option_groups: [],
    answer_text: "Yes, every day from 7:00.",
    truncated: false,
  },
  spans: [
    span(1, "retriever", "search:chat", "wardrobe", 5, 180, {
      payload: {
        purpose: "chat",
        query: "Is Széchenyi open on Mondays?",
        filters: { city: "budapest", districts: [], categories: [], kinds: [], price_tier_max: null, bbox: null },
        k: 3,
        ladder_step: null,
        embedding_model: EMBEDDING_MODEL,
        embed_tokens: 9,
        n_results: 3,
        no_hit: false,
      },
      results: results(0, 0.301, 0).slice(0, 3),
    }),
    span(2, "llm", "chat", "zip", 200, 2150, {
      payload: {
        ...LLM_DEFAULTS,
        operation: "chat",
        input_tokens: 900,
        output_tokens: 120,
        ttfc_ms: 480,
        input: "Is Széchenyi open on Mondays?",
        output: "Yes, every day from 7:00.",
      },
    }),
  ],
  timeline: [
    { t_ms: 700, type: "text", summary: "", bytes: 410, count: 20 },
    { t_ms: 2390, type: "done", summary: "end", bytes: 16, count: 1 },
  ],
} satisfies TurnDetail;
