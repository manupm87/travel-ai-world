/**
 * The only module that knows where the backend lives.
 *
 * Two services, two base URLs, one fallback:
 * - NEXT_PUBLIC_API_URL     → core_api (auth, users, trips)
 * - NEXT_PUBLIC_AI_API_URL  → ai_api (chat). Defaults to the core URL, so a
 *   single-origin deployment (reverse proxy) only sets the first variable.
 *
 * When neither is set (static GitHub Pages build) backend features are
 * gracefully disabled.
 */

import { readToken } from "./session";

export type Service = "core" | "ai";

const CORE_URL = process.env.NEXT_PUBLIC_API_URL ?? "";
const AI_URL = process.env.NEXT_PUBLIC_AI_API_URL ?? CORE_URL;

const API_PREFIX = "/api/v1";

/** Raised when the backend rejects our token, or when we never had one. */
export class UnauthorizedError extends Error {
  constructor(message = "Unauthorized") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

/** True when core_api is configured. */
export function isApiAvailable(): boolean {
  return CORE_URL.length > 0;
}

/** True when ai_api is configured (directly or through the core URL). */
export function isAiAvailable(): boolean {
  return AI_URL.length > 0;
}

/** Absolute URL for a versioned path on the given service. */
export function apiUrl(service: Service, path: string): string {
  const base = service === "ai" ? AI_URL : CORE_URL;
  return `${base}${API_PREFIX}${path}`;
}

/** The session's bearer token. Null during SSR, or when logged out. */
export function getStoredToken(): string | null {
  return readToken();
}

/** Authorization header for the stored session, or throws when there is none. */
export function authHeaders(): Record<string, string> {
  const token = getStoredToken();
  // No token, no point in asking: the backend would answer 401 anyway.
  if (!token) throw new UnauthorizedError("No session token available");
  return { Authorization: `Bearer ${token}` };
}

/**
 * Backend error bodies are `{ detail: { message, error_code } }` (domain
 * errors) or `{ detail: string }` (framework errors). Extract the message.
 */
export async function readErrorMessage(
  res: Response,
  fallback: string
): Promise<string> {
  const body = await res.json().catch(() => null);
  const detail = body?.detail;
  if (typeof detail === "string") return detail;
  if (detail && typeof detail.message === "string") return detail.message;
  return fallback;
}
