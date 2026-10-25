/**
 * The admin console's test doubles: one answer per admin route, checked with `satisfies` so a
 * contract change breaks the fixtures before the tests. Shared with `e2e/admin.spec.ts`.
 */

import type {
  AccessGrantPage,
  AdminUsage,
  AdminTripPage,
  AdminUserPage,
  EvalItem,
  EvalRun,
  EvalRunDetail,
  RetrievalEval,
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
    fallback_rate: 0,
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
    fallbacks: 0,
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

/** The access list: one grant with its own limit, one unlimited, one on the default. */
export const ACCESS_GRANT_PAGE = {
  items: [
    {
      email: "ada@example.com",
      daily_token_limit: 50_000,
      note: "team",
      added_by: ADA_SUBJECT,
      created_at: "2026-09-30T09:00:00Z",
      updated_at: "2026-09-30T09:00:00Z",
    },
    {
      email: "grace@example.com",
      daily_token_limit: 0,
      note: null,
      added_by: ADA_SUBJECT,
      created_at: "2026-09-30T10:00:00Z",
      updated_at: "2026-10-01T08:00:00Z",
    },
    {
      email: "linus@example.com",
      daily_token_limit: null,
      note: null,
      added_by: ADA_SUBJECT,
      created_at: "2026-10-01T07:30:00Z",
      updated_at: "2026-10-01T07:30:00Z",
    },
  ],
  next_cursor: null,
} satisfies AccessGrantPage;

/** Today's token counters: Ada over her 50,000, Grace (unlimited), an unknown subject. */
export const ADMIN_USAGE = {
  day: "2026-10-01",
  items: [
    { subject: ADA_SUBJECT, input_tokens: 40_000, output_tokens: 12_500, embed_tokens: 300, tokens: 52_500, turns: 14 },
    { subject: GRACE_SUBJECT, input_tokens: 9_000, output_tokens: 3_000, embed_tokens: 120, tokens: 12_000, turns: 5 },
    { subject: "ffffffff-0000-4000-8000-00000unknown", input_tokens: 700, output_tokens: 300, embed_tokens: 0, tokens: 1_000, turns: 1 },
  ],
} satisfies AdminUsage;

/** One run of the retrieval evaluation: two cities, one miss, one id gone from the index. */
export const RETRIEVAL_EVAL = {
  ran_at: "2026-10-01T19:30:00Z",
  index: "travel-ai-vectors/city-kb",
  embeddings_model: "amazon.titan-embed-text-v2:0",
  top_k: 10,
  overall: { label: "all", questions: 40, recall_at_5: 0.6352, recall_at_10: 0.7261, mrr: 0.6559 },
  by_city: [
    { label: "budapest", questions: 20, recall_at_5: 0.5167, recall_at_10: 0.675, mrr: 0.4661 },
    { label: "madrid", questions: 20, recall_at_5: 0.6875, recall_at_10: 0.7208, mrr: 0.7167 },
  ],
  by_language: [
    { label: "en", questions: 24, recall_at_5: 0.6021, recall_at_10: 0.6917, mrr: 0.6021 },
    { label: "es", questions: 16, recall_at_5: 0.6858, recall_at_10: 0.7778, mrr: 0.7361 },
  ],
  misses: [
    {
      city: "madrid",
      id: "ninos-lluvia-es",
      lang: "es",
      query: "algo para hacer con niños si llueve",
      expected: [
        { doc_id: "wv:en:Madrid/Arganzuela#see:planetario-de-madrid", rank: null },
        { doc_id: "wv:en:Madrid/Chamberí-Castellana#see:museo-nacional-de-ciencias-naturales", rank: 4 },
      ],
    },
  ],
  missing_from_index: ["osm:node/13830250001"],
} satisfies RetrievalEval;

/** A graded answer of a `questions` run: a low groundedness with one unsupported claim. */
export const EVAL_ITEM = {
  key: "miami/vizcaya",
  city: "miami",
  id: "vizcaya",
  lang: "en",
  query: "vizcaya museum tickets price",
  answerable: true,
  passages: ["wv:en:Miami/Coconut Grove#see:vizcaya-museum-and-gardens"],
  answer: "Tickets cost €25.",
  verdict: {
    groundedness: 2,
    relevance: 5,
    acknowledges_gap: false,
    unsupported_claims: ["€25"],
    reason: "The passage gives the price in dollars.",
  },
  error: null,
  expected: null,
  origin: null,
  defect: null,
  why: null,
} satisfies EvalItem;

/** A finished `questions` run over two cities. */
export const EVAL_RUN_ANSWERS = {
  run_id: "run-answers",
  set: "questions",
  status: "done",
  started_at: "2026-10-25T10:00:00Z",
  finished_at: "2026-10-25T10:03:00Z",
  answer_model: "eu.anthropic.claude-haiku-4-5-20251001-v1:0",
  judge_model: "eu.amazon.nova-pro-v1:0",
  judge_prompt: "f7a13e321bf8",
  index: "travel-ai-vectors/city-kb",
  total: 3,
  graded: 3,
  failed: 0,
  usd: 0.59,
  answers: {
    overall: { label: "all", answers: 2, groundedness: 4.72, relevance: 4.98, low_share: 0.04 },
    by_city: [
      { label: "madrid", answers: 1, groundedness: 4.7, relevance: 5, low_share: 0.05 },
      { label: "miami", answers: 1, groundedness: 4.6, relevance: 5, low_share: 0.1 },
    ],
    by_language: [{ label: "en", answers: 2, groundedness: 4.74, relevance: 4.99, low_share: 0.03 }],
    unanswerable: 1,
    unanswerable_acknowledged: 1,
    turned_down: [],
    worst: ["miami/vizcaya"],
    answering: { model: "eu.anthropic.claude-haiku-4-5-20251001-v1:0", input_tokens: 216_000, output_tokens: 25_000, usd: 0.34 },
    judging: { model: "eu.amazon.nova-pro-v1:0", input_tokens: 285_000, output_tokens: 8_000, usd: 0.25 },
  },
  agreement: null,
  error: null,
} satisfies EvalRun;

/** A finished judge check: one disagreement on a perturbed answer. */
export const EVAL_RUN_GOLDEN = {
  run_id: "run-golden",
  set: "golden",
  status: "done",
  started_at: "2026-10-25T09:00:00Z",
  finished_at: "2026-10-25T09:00:40Z",
  answer_model: null,
  judge_model: "eu.amazon.nova-pro-v1:0",
  judge_prompt: "f7a13e321bf8",
  index: null,
  total: 2,
  graded: 2,
  failed: 0,
  usd: 0.04,
  answers: null,
  agreement: {
    cases: 2,
    groundedness: {
      score: "groundedness",
      exact: 0.5,
      within_one: 1,
      kappa: 0.67,
      confusion: [
        [0, 0, 0, 0, 0],
        [0, 0, 1, 0, 0],
        [0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0],
        [0, 0, 0, 0, 1],
      ],
      mean_expected: 3.5,
      mean_judge: 4,
    },
    relevance: {
      score: "relevance",
      exact: 1,
      within_one: 1,
      kappa: null,
      confusion: [
        [0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0],
        [0, 0, 0, 0, 2],
      ],
      mean_expected: 5,
      mean_judge: 5,
    },
    low_kappa: 0,
    low_agreement: 0.5,
    gap_accuracy: 1,
    exact_real: 1,
    exact_perturbed: 0,
    disagreements: ["miami/vizcaya~currency"],
    judging: { model: "eu.amazon.nova-pro-v1:0", input_tokens: 40_000, output_tokens: 2_000, usd: 0.04 },
  },
  error: null,
} satisfies EvalRun;

/** The judge check above, opened: its two cases. */
export const EVAL_RUN_GOLDEN_DETAIL = {
  run: EVAL_RUN_GOLDEN,
  items: [
    {
      ...EVAL_ITEM,
      key: "miami/vizcaya~currency",
      id: "vizcaya~currency",
      verdict: { ...EVAL_ITEM.verdict, groundedness: 3 },
      expected: { groundedness: 2, relevance: 5, acknowledges_gap: false },
      origin: "perturbed",
      defect: "wrong-currency",
      why: "The passage says $25; the answer says €25.",
    },
    {
      ...EVAL_ITEM,
      key: "madrid/prado",
      city: "madrid",
      id: "prado",
      query: "Is the Prado free on Sundays?",
      answer: "Yes, from 17:00.",
      verdict: { ...EVAL_ITEM.verdict, groundedness: 5, unsupported_claims: [], reason: "Supported." },
      expected: { groundedness: 5, relevance: 5, acknowledges_gap: false },
      origin: "real",
      why: "Every claim is in the passage.",
    },
  ],
} satisfies EvalRunDetail;
