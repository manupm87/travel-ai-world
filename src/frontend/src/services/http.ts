/**
 * The only module that knows where the backend lives, and the one place
 * that turns an HTTP response into either data or a domain error.
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
// An empty string (e.g. `NEXT_PUBLIC_AI_API_URL=` in .env) counts as unset.
const AI_URL = process.env.NEXT_PUBLIC_AI_API_URL || CORE_URL;

const API_PREFIX = "/api/v1";

/**
 * A non-2xx answer from the backend. `code` is the backend's `error_code`
 * when the body was a domain error, so the UI can pick its own translated
 * message instead of showing the server's.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string | null;

  constructor(status: number, message: string, code: string | null = null) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

/** Raised when the backend rejects our token, or when we never had one. */
export class UnauthorizedError extends ApiError {
  constructor(message = "Unauthorized", code: string | null = null) {
    super(401, message, code);
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

export interface ErrorBody {
  message: string | null;
  code: string | null;
}

/**
 * Backend error bodies are `{ detail: { message, error_code } }` (domain
 * errors) or `{ detail: string }` (framework errors). Pure.
 */
export function parseErrorBody(body: unknown): ErrorBody {
  const detail = (body as { detail?: unknown } | null)?.detail;
  if (typeof detail === "string") return { message: detail, code: null };
  if (detail && typeof detail === "object") {
    const { message, error_code } = detail as {
      message?: unknown;
      error_code?: unknown;
    };
    return {
      message: typeof message === "string" ? message : null,
      code: typeof error_code === "string" ? error_code : null,
    };
  }
  return { message: null, code: null };
}

/** Reads and parses an error response's body; tolerates non-JSON bodies. */
export async function readErrorBody(res: Response): Promise<ErrorBody> {
  const body: unknown = await res.json().catch(() => null);
  return parseErrorBody(body);
}

/** The error message from a failed response, or `fallback`. */
export async function readErrorMessage(
  res: Response,
  fallback: string
): Promise<string> {
  return (await readErrorBody(res)).message ?? fallback;
}

export interface RequestOptions extends Omit<RequestInit, "body"> {
  /** JSON-serialised into the body with the matching Content-Type. */
  json?: unknown;
  /** Attach the session's bearer token (throws UnauthorizedError if none). */
  auth?: boolean;
}

/**
 * Performs a request against a service and resolves with the raw `Response`
 * only when it is 2xx. Any other status becomes an `ApiError`
 * (`UnauthorizedError` for 401) carrying the backend's message and code.
 */
export async function requestRaw(
  service: Service,
  path: string,
  { json, auth = false, headers, ...init }: RequestOptions = {}
): Promise<Response> {
  const res = await fetch(apiUrl(service, path), {
    ...init,
    headers: {
      ...(json !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(auth ? authHeaders() : {}),
      ...headers,
    },
    body: json !== undefined ? JSON.stringify(json) : undefined,
  });

  if (res.ok) return res;

  const { message, code } = await readErrorBody(res);
  const text = message ?? `Request failed with status ${res.status}`;
  if (res.status === 401) throw new UnauthorizedError(text, code);
  throw new ApiError(res.status, text, code);
}

/** `requestRaw` plus JSON decoding of the successful body. */
export async function request<T>(
  service: Service,
  path: string,
  options?: RequestOptions
): Promise<T> {
  const res = await requestRaw(service, path, options);
  return res.json() as Promise<T>;
}
