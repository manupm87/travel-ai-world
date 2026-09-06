/**
 * API client for the Travel AI World backend.
 *
 * When NEXT_PUBLIC_API_URL is set, calls hit the real backend.
 * When it's absent (e.g. static GitHub Pages deployment), features
 * that require the backend are gracefully disabled.
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

export const TOKEN_STORAGE_KEY = "travel_ai_token";
export const USER_STORAGE_KEY = "travel_ai_user";

/**
 * Raised when the backend rejects our token, or when we never had one.
 */
export class UnauthorizedError extends Error {
  constructor(message = "Unauthorized") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

/**
 * Returns true when a backend API URL is configured.
 */
export function isApiAvailable(): boolean {
  return API_URL.length > 0;
}

/**
 * Reads our JWT from storage. Null during SSR, or when logged out.
 */
function getStoredToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

/**
 * Sends a Google ID token to the backend for verification.
 * Returns our own JWT + user profile on success.
 */
export async function verifyGoogleToken(credential: string): Promise<{
  access_token: string;
  user: { id: string; email: string; name: string; picture?: string };
}> {
  const res = await fetch(`${API_URL}/api/v1/auth/google`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ credential }),
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ detail: "Auth failed" }));
    throw new Error(error.detail?.message ?? error.detail ?? "Auth failed");
  }

  return res.json();
}

/**
 * Streams a chat completion from the backend AI endpoint.
 * Yields content chunks as they arrive via SSE.
 *
 * The endpoint requires authentication, so our JWT travels in the
 * Authorization header and a rejected session surfaces as UnauthorizedError.
 */
export async function* streamChat(
  message: string,
  history: { role: string; content: string }[]
): AsyncGenerator<string, void, unknown> {
  const token = getStoredToken();

  // No token, no point in asking: the backend would answer 401 anyway.
  if (!token) {
    throw new UnauthorizedError("No session token available");
  }

  const res = await fetch(`${API_URL}/api/v1/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ message, history }),
  });

  if (res.status === 401) {
    throw new UnauthorizedError("Session expired or invalid");
  }

  if (!res.ok) {
    const error = await res.json().catch(() => ({ detail: "Chat failed" }));
    throw new Error(error.detail ?? "Chat service unavailable");
  }

  const reader = res.body?.getReader();
  if (!reader) throw new Error("No response body");

  const decoder = new TextDecoder();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const text = decoder.decode(value, { stream: true });
    // SSE format: "data: <content>\n\n"
    const lines = text.split("\n");
    for (const line of lines) {
      if (line.startsWith("data: ")) {
        const data = line.slice(6).trim();
        if (data === "[DONE]") return;
        try {
          const parsed = JSON.parse(data);
          if (parsed.content) yield parsed.content as string;
        } catch {
          // skip malformed chunks
        }
      }
    }
  }
}
