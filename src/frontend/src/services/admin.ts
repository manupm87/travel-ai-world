/**
 * The admin console's reads (TRA-222, ADR 0024). Every call carries the
 * session token; the services answer 403 to anyone who is not in the
 * Cognito group `admin`.
 *
 * - `ai_api` owns the turn traces: `/ai/admin/stats`, `/ai/admin/turns`,
 *   `/ai/admin/turns/{id}` and `/ai/admin/sessions/{id}`; and the daily
 *   token counters (TRA-258, ADR 0026): `/ai/admin/usage`.
 * - `core_api` owns the accounts and the trips: `/admin/users`,
 *   `/admin/trips` and `/admin/trips/{user_id}/{trip_id}`; and the access
 *   list (TRA-257, ADR 0026), the console's only writes: `/admin/access`
 *   and `/admin/access/{email}`.
 *
 * Neither service reads the other's table, so the console joins a trace's
 * `subject` to an account in the browser, from `listAdminUsers`.
 * Every shape is the generated one; nothing here is redeclared.
 */

import type { components as AiComponents } from "@/types/generated/ai-api";
import type { components as CoreComponents } from "@/types/generated/core-api";
import { ApiError, request, requestRaw } from "./http";

export type TraceStats = AiComponents["schemas"]["TraceStatsResponse"];
export type DayStats = AiComponents["schemas"]["DayStatsResponse"];
export type TurnPage = AiComponents["schemas"]["TurnPageResponse"];
export type TurnSummary = AiComponents["schemas"]["TurnSummaryResponse"];
export type TurnDetail = AiComponents["schemas"]["TurnDetailResponse"];
export type TurnKind = TurnSummary["kind"];
export type TurnStatus = TurnSummary["status"];
export type AdminUsage = AiComponents["schemas"]["AdminUsageResponse"];
export type AdminUsageItem = AiComponents["schemas"]["AdminUsageItem"];
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
