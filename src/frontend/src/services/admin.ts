/**
 * The admin console's calls (ADR 0024, ADR 0026, ADR 0039): ai_api's traces, token counters and
 * evaluation runs, core_api's accounts, trips and access list. The writes are the access list and
 * the evaluation runs the console starts. Both answer 403 outside the `admin` group.
 * Neither reads the other's table, so the console joins a trace's `subject` to an account here.
 */

import type { components as AiComponents } from "@/types/generated/ai-api";
import type { components as CoreComponents } from "@/types/generated/core-api";
import { ApiError, request, requestRaw } from "./http";
import { readSse } from "./sse";

export type TraceStats = AiComponents["schemas"]["TraceStatsResponse"];
export type DayStats = AiComponents["schemas"]["DayStatsResponse"];
export type TurnPage = AiComponents["schemas"]["TurnPageResponse"];
export type TurnSummary = AiComponents["schemas"]["TurnSummaryResponse"];
export type TurnDetail = AiComponents["schemas"]["TurnDetailResponse"];
export type TurnKind = TurnSummary["kind"];
export type TurnStatus = TurnSummary["status"];
export type AdminUsage = AiComponents["schemas"]["AdminUsageResponse"];
export type RetrievalEval = AiComponents["schemas"]["RetrievalEvalResponse"];
export type RetrievalScores = AiComponents["schemas"]["RetrievalScoresResponse"];
export type AdminUsageItem = AiComponents["schemas"]["AdminUsageItem"];
export type EvalSet = AiComponents["schemas"]["AnswerEvalRequest"]["set"];
export type EvalRun = AiComponents["schemas"]["EvalRunResponse"];
export type EvalRunPage = AiComponents["schemas"]["EvalRunPageResponse"];
export type EvalRunDetail = AiComponents["schemas"]["EvalRunDetailResponse"];
export type EvalItem = AiComponents["schemas"]["EvalItemResponse"];
export type AnswerReport = AiComponents["schemas"]["AnswerReportResponse"];
export type AgreementReport = AiComponents["schemas"]["AgreementReportResponse"];
export type ScoreAgreement = AiComponents["schemas"]["ScoreAgreementResponse"];
export type EvalMeans = AiComponents["schemas"]["MeansResponse"];
export type AnswerEvalEvent = AiComponents["schemas"]["AnswerEvalEvent"];
export type AdminUser = CoreComponents["schemas"]["UserResponse"];
export type AdminUserPage = CoreComponents["schemas"]["AdminUserPage"];
export type AdminTripPage = CoreComponents["schemas"]["AdminTripPage"];
export type AdminTripSummary = CoreComponents["schemas"]["AdminTripSummary"];
export type AdminTrip = CoreComponents["schemas"]["TripResponse"];
export type AccessGrant = CoreComponents["schemas"]["AccessGrantResponse"];
export type AccessGrantPage = CoreComponents["schemas"]["AccessGrantPage"];
export type AccessGrantWrite = CoreComponents["schemas"]["AccessGrantWrite"];

/** The turns explorer's filters; only the ones that are set are sent. */
export interface TurnQuery {
  /** A UTC day, `YYYY-MM-DD`. */
  day?: string;
  kind?: TurnKind;
  status?: TurnStatus;
  /** The token subject of a user. */
  subject?: string;
  /** A planner session id. */
  session?: string;
  tripId?: string;
  city?: string;
  limit?: number;
}

interface ReadOptions {
  signal?: AbortSignal;
}

/** `?a=1&b=2` from the params that have a value; `""` when none has. */
function query(params: Record<string, string | number | null | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    search.set(key, String(value));
  }
  const text = search.toString();
  return text ? `?${text}` : "";
}

/** `null` on 404, the rest rethrown. */
async function orNull<T>(promise: Promise<T>): Promise<T | null> {
  try {
    return await promise;
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return null;
    throw err;
  }
}

/** Counts, tokens, cost, latency and RAG metrics over `[start, end]` (UTC days, ≤ 31). */
export function getStats(start: string, end: string, { signal }: ReadOptions = {}): Promise<TraceStats> {
  return request<TraceStats>("ai", `/ai/admin/stats${query({ start, end })}`, { auth: true, signal });
}

/** One page of turns for the filters; pass the previous page's `next_cursor` for the next. */
export function listTurns(
  params: TurnQuery,
  cursor?: string | null,
  { signal }: ReadOptions = {}
): Promise<TurnPage> {
  const qs = query({
    day: params.day,
    kind: params.kind,
    status: params.status,
    subject: params.subject,
    session: params.session,
    trip_id: params.tripId,
    city: params.city,
    cursor,
    limit: params.limit,
  });
  return request<TurnPage>("ai", `/ai/admin/turns${qs}`, { auth: true, signal });
}

/** One turn, whole; `null` when there is no such turn. */
export function getTurn(turnId: string, { signal }: ReadOptions = {}): Promise<TurnDetail | null> {
  return orNull(
    request<TurnDetail>("ai", `/ai/admin/turns/${encodeURIComponent(turnId)}`, { auth: true, signal })
  );
}

/** One planner conversation's turns, oldest first. */
export function listSessionTurns(
  sessionId: string,
  cursor?: string | null,
  { signal }: ReadOptions = {}
): Promise<TurnPage> {
  return request<TurnPage>(
    "ai",
    `/ai/admin/sessions/${encodeURIComponent(sessionId)}${query({ cursor })}`,
    { auth: true, signal }
  );
}

/** One page of accounts (200 at a time). */
export function listAdminUsers(cursor?: string | null, { signal }: ReadOptions = {}): Promise<AdminUserPage> {
  return request<AdminUserPage>("core", `/admin/users${query({ cursor, limit: 200 })}`, {
    auth: true,
    signal,
  });
}

/** One page of every account's trips, newest first (50 at a time). */
export function listAdminTrips(cursor?: string | null, { signal }: ReadOptions = {}): Promise<AdminTripPage> {
  return request<AdminTripPage>("core", `/admin/trips${query({ cursor, limit: 50 })}`, {
    auth: true,
    signal,
  });
}

/** Anyone's trip, whole; `null` when there is no such trip. */
export function getAdminTrip(
  userId: string,
  tripId: string,
  { signal }: ReadOptions = {}
): Promise<AdminTrip | null> {
  return orNull(
    request<AdminTrip>(
      "core",
      `/admin/trips/${encodeURIComponent(userId)}/${encodeURIComponent(tripId)}`,
      { auth: true, signal }
    )
  );
}

const accessPath = (email: string) => `/admin/access/${encodeURIComponent(email.trim().toLowerCase())}`;

/** One page of the access list, by email (200 at a time). */
export function listAccessGrants(
  cursor?: string | null,
  { signal }: ReadOptions = {}
): Promise<AccessGrantPage> {
  return request<AccessGrantPage>("core", `/admin/access${query({ cursor, limit: 200 })}`, {
    auth: true,
    signal,
  });
}

/**
 * Invites `email`, or replaces its limit and note (an upsert).
 * `daily_token_limit`: `null` = the service default, `0` = unlimited.
 */
export function putAccessGrant(
  email: string,
  grant: AccessGrantWrite,
  { signal }: ReadOptions = {}
): Promise<AccessGrant> {
  return request<AccessGrant>("core", accessPath(email), {
    auth: true,
    method: "PUT",
    json: { daily_token_limit: grant.daily_token_limit ?? null, note: grant.note ?? null },
    signal,
  });
}

/** Takes `email` off the list; a 404 (it was not on it) rejects like any failure. */
export async function deleteAccessGrant(email: string, { signal }: ReadOptions = {}): Promise<void> {
  await requestRaw("core", accessPath(email), { auth: true, method: "DELETE", signal });
}

/**
 * Every account's token counter of one UTC day (`YYYY-MM-DD`; today when
 * omitted), most tokens first. Keyed by token subject: ai_api knows no email.
 */
export function getAdminUsage(day?: string, { signal }: ReadOptions = {}): Promise<AdminUsage> {
  return request<AdminUsage>("ai", `/ai/admin/usage${query({ day })}`, { auth: true, signal });
}

/**
 * Runs the retrieval evaluation: every city's questions against the deployed index, recall@5/10
 * and MRR back in a few seconds. Nothing is stored, so every call is a new run.
 */
export function runRetrievalEval({ signal }: ReadOptions = {}): Promise<RetrievalEval> {
  return request<RetrievalEval>("ai", "/ai/admin/retrieval-eval", {
    auth: true,
    method: "POST",
    signal,
  });
}

/** A typed event of an evaluation run's stream, or `null` for anything else. */
function toAnswerEvalEvent(payload: unknown): AnswerEvalEvent | null {
  if (typeof payload !== "object" || payload === null) return null;
  const type = (payload as { type?: unknown }).type;
  return type === "progress" || type === "report" || type === "error"
    ? (payload as AnswerEvalEvent)
    : null;
}

/**
 * Starts an answer evaluation (`questions`: the production model answers, the judge grades) or a
 * judge validation (`golden`) and yields its events as they come: one `progress` per item, then
 * the stored `report`. A run already in progress is a 409 `ApiError` before the stream; a failure
 * mid-run is an `error` event. The run is stored as it goes, so the history has it either way.
 */
export async function* streamAnswerEval(
  set: EvalSet,
  { signal }: ReadOptions = {}
): AsyncGenerator<AnswerEvalEvent, void, unknown> {
  const res = await requestRaw("ai", "/ai/admin/answer-eval", {
    method: "POST",
    json: { set },
    auth: true,
    signal,
  });
  for await (const payload of readSse(res)) {
    const event = toAnswerEvalEvent(payload);
    if (event) yield event;
  }
}

/** The latest evaluation runs, newest first. */
export function listAnswerEvals({ signal }: ReadOptions = {}): Promise<EvalRunPage> {
  return request<EvalRunPage>("ai", "/ai/admin/answer-evals", { auth: true, signal });
}

/** One evaluation run with every item it graded; `null` when there is no such run. */
export function getAnswerEval(
  runId: string,
  { signal }: ReadOptions = {}
): Promise<EvalRunDetail | null> {
  return orNull(
    request<EvalRunDetail>("ai", `/ai/admin/answer-evals/${encodeURIComponent(runId)}`, {
      auth: true,
      signal,
    })
  );
}
