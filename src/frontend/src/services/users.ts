/**
 * The signed-in account as `core_api` knows it (`GET /api/v1/users/me`).
 *
 * The token says who you are; this says what the account is — its `role`
 * above all, which the header and the admin console read (TRA-222). The
 * profile cached at sign-in has no role of its own, so `AuthContext` asks
 * here once per session and merges the answer through `session.ts`.
 */

import type { components } from "@/types/generated/core-api";
import { ApiError, request } from "./http";

export type UserResponse = components["schemas"]["UserResponse"];

/** The account behind the session token; `null` on 401 or 404 (no account to describe). */
export async function getMe({ signal }: { signal?: AbortSignal } = {}): Promise<UserResponse | null> {
  try {
    return await request<UserResponse>("core", "/users/me", { auth: true, signal });
  } catch (err) {
    if (err instanceof ApiError && (err.status === 401 || err.status === 404)) return null;
    throw err;
  }
}
