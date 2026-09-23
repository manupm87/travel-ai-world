/**
 * The admin console's test doubles (TRA-222): one answer per admin route,
 * typed by the generated schemas through `services/admin.ts` and checked with
 * `satisfies`, so a contract change breaks the fixtures before the tests.
 * Shared by the unit tests and `e2e/admin.spec.ts`.
 */

import type {
  AdminTripPage,
  AdminUserPage,
  TraceStats,
  TurnDetail,
  TurnPage,
  TurnSummary,
} from "@/services/admin";

export const ADA_SUBJECT = "a1b2c3d4-0000-4000-8000-00000000ada0";
export const GRACE_SUBJECT = "e5f6a7b8-0000-4000-8000-0000000grace";
export const ADA_ID = "0b6f7c1e-5d3a-4c8e-9f21-7a4b2c9d1e60";
export const GRACE_ID = "7d2e1f0a-3b4c-4d5e-8f60-718293a4b5c6";

export const ADMIN_USER_PAGE = {
  items: [
    {
      id: ADA_ID,
      email: "ada@example.com",
      name: "Ada Lovelace",
      picture: null,
      role: "admin",
      subject: ADA_SUBJECT,
      is_active: true,
      auth_provider: "cognito",
    },
    {
      id: GRACE_ID,
      email: "grace@example.com",
      name: "Grace Hopper",
      picture: null,
      role: "user",
      subject: GRACE_SUBJECT,
      is_active: true,
      auth_provider: "cognito",
    },
  ],
  next_cursor: null,
} satisfies AdminUserPage;

const DAYS = ["2026-09-17", "2026-09-18", "2026-09-19", "2026-09-20", "2026-09-21", "2026-09-22", "2026-09-23"];

export const TRACE_STATS = {
  start: "2026-09-17",
  end: "2026-09-23",
  days: DAYS.map((day, i) => ({
    day,
    turns: 10 + i,
    ok: 8 + i,
    errors: i % 3 === 0 ? 1 : 0,
    cancelled: i % 3 === 0 ? 1 : 2,
    input_tokens: 12_000 + i * 900,
    output_tokens: 3_000 + i * 450,
    embed_tokens: 400,
    cost_usd: 0.02 + i * 0.003,
    latency_p50_ms: 2_100 + i * 40,
    latency_p95_ms: 6_400 + i * 120,
    first_event_p50_ms: 850,
  })),
  totals: {
    turns: 91,
    ok: 77,
    errors: 3,
    cancelled: 11,
    sessions: 24,
    subjects: 2,
    input_tokens: 102_900,
    output_tokens: 30_450,
    embed_tokens: 2_800,
    cost_usd: 0.203,
    latency_p50_ms: 2_220,
    latency_p95_ms: 6_760,
    first_event_p50_ms: 850,
  },
  rag: {
    retrievals_per_turn: 1.84,
    no_hit_rate: 0.052,
    used_over_retrieved: 0.31,
    mean_distance_used: 0.27,
    repair_rate: 0.04,
    dropped_ids: 2,
  },
  by_model: [
    { model: "meta/llama-3.3-70b-instruct", turns: 91, input_tokens: 102_900, output_tokens: 30_450, cost_usd: 0.203 },
  ],
  by_city: [
    { city: "budapest", turns: 60, errors: 2 },
    { city: "bologna", turns: 31, errors: 1 },
  ],
  by_kind: [
    { kind: "planner", turns: 80, errors: 3, cost_usd: 0.19 },
    { kind: "card", turns: 11, errors: 0, cost_usd: 0.013 },
  ],
  top_used: [
    { doc_id: "budapest:see:szechenyi-baths", title: "Széchenyi Thermal Bath", count: 14 },
    { doc_id: "budapest:eat:central-market", title: "Great Market Hall", count: 9 },
  ],
  never_used: [{ doc_id: "budapest:do:escape-room-17", title: null, retrieved: 6 }],
} satisfies TraceStats;

/** A turn summary with every field filled; override what a test cares about. */
export function turnSummary(overrides: Partial<TurnSummary> = {}): TurnSummary {
  return {
    turn_id: "01J8TURN0000000000000000A1",
    ts: "2026-09-23T09:14:05Z",
    day: "2026-09-23",
    sk: "2026-09-23T09:14:05Z#01J8TURN0000000000000000A1",
    kind: "planner",
    route: "/api/v1/ai/planner",
    status: "ok",
    error_code: null,
    subject: ADA_SUBJECT,
    session_id: "sess-1",
    trip_id: null,
    city: "budapest",
    action: "message",
    language: "en",
    model: "meta/llama-3.3-70b-instruct",
    provider: "nvidia",
    prompt_version: "v3",
    pricing_version: "2026-09",
    llm_calls: 2,
    retrievals: 2,
    docs_retrieved: 16,
    docs_used: 5,
    dropped_ids: 0,
    repairs: 0,
    warnings: 0,
    prices_stripped: 0,
    input_tokens: 1_420,
    output_tokens: 380,
    embed_tokens: 40,
    cost_usd: 0.0021,
    latency_ms: 4_260,
    first_event_ms: 910,
    question_preview: "Four days in Budapest in October, thermal baths and wine",
    answer_preview: "Here is a first plan…",
    events: { text: 12, options: 1 },
    ops: {},
    sources: [],
    truncated: false,
    ...overrides,
  };
}

export const TURN_PAGE = {
  items: [
    turnSummary(),
    turnSummary({
      turn_id: "01J8TURN0000000000000000B2",
      ts: "2026-09-23T10:02:44Z",
      subject: GRACE_SUBJECT,
      city: "bologna",
      status: "error",
      error_code: "LLM_TIMEOUT",
      question_preview: "A long weekend in Bologna, all about eating",
    }),
    turnSummary({
      turn_id: "01J8TURN0000000000000000C3",
      ts: "2026-09-23T11:30:00Z",
      kind: "card",
      action: null,
      status: "cancelled",
      latency_ms: 640,
      question_preview: "Széchenyi Thermal Bath",
    }),
  ],
  next_cursor: null,
} satisfies TurnPage;

export const TURN_DETAIL = {
  summary: turnSummary(),
  context: {
    message: "Four days in Budapest in October, thermal baths and wine",
    action: null,
    brief: { destination: "Budapest" },
    history: [],
    itinerary_ids: [],
    exclude_card_ids: [],
    ops: [],
    option_groups: [],
    answer_text: "Here is a first plan…",
    truncated: false,
  },
  spans: [],
  timeline: [{ t_ms: 910, type: "text", summary: "12 deltas", bytes: 640, count: 12 }],
} satisfies TurnDetail;

export const ADMIN_TRIP_PAGE = {
  items: [
    {
      id: "5f0c2c52-1d7e-4b3a-9c8f-2a1b3c4d5e6f",
      user_id: ADA_ID,
      title: "Budapest in October",
      city: "Budapest",
      city_slug: "budapest",
      country_code: "HU",
      start_date: "2026-10-23",
      end_date: "2026-10-25",
      phase: "upcoming",
      image_url: null,
      planner_session_id: "sess-1",
      created_at: "2026-09-20T08:00:00Z",
      updated_at: "2026-09-20T08:00:00Z",
    },
    {
      id: "8a9b0c1d-2e3f-4a5b-8c6d-7e8f9a0b1c2d",
      user_id: GRACE_ID,
      title: "Eating in Bologna",
      city: "Bologna",
      city_slug: "bologna",
      country_code: "IT",
      start_date: "2026-09-01",
      end_date: "2026-09-04",
      phase: "past",
      image_url: null,
      planner_session_id: null,
      created_at: "2026-08-15T08:00:00Z",
      updated_at: "2026-08-15T08:00:00Z",
    },
  ],
  next_cursor: null,
} satisfies AdminTripPage;
