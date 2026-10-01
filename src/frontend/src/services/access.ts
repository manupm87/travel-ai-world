/**
 * Whether the signed-in account may use the app (`GET /api/v1/users/me/access`,
 * TRA-257, ADR 0026).
 *
 * core_api keeps an access list: with `ACCESS_MODE=allowlist` only invited
 * emails and administrators get past it, and everything else answers 403
 * `ACCESS_DENIED`. This one route answers for an uninvited account too, so
 * the UI can say so instead of failing request by request. It also carries
 * the account's daily token limit (`null` = unlimited), which ai_api enforces:
 * a planner turn over it is refused with 429 `DAILY_TOKEN_LIMIT` (TRA-258).
 */

import type { components } from "@/types/generated/core-api";
import { ApiError, request } from "./http";

export type AccessResponse = components["schemas"]["AccessResponse"];

/** The caller's access; `null` on 401 or 404 (no account, or a backend without the route). */
export async function getMyAccess({ signal }: { signal?: AbortSignal } = {}): Promise<AccessResponse | null> {
  try {
    return await request<AccessResponse>("core", "/users/me/access", { auth: true, signal });
  } catch (err) {
    if (err instanceof ApiError && (err.status === 401 || err.status === 404)) return null;
    throw err;
  }
}
