import { ApiError, UnauthorizedError } from "@/services/http";
import { clearSession } from "@/services/session";

/** What an admin read can fail with, as the console says it. */
export type AdminError = "forbidden" | "failed";

/** Whether a rejection is the abort we asked for. */
export function isAbort(err: unknown): boolean {
  return err instanceof Error && err.name === "AbortError";
}

/**
 * Turns a failed admin read into what the page shows. A 401 clears the
 * session (the route guard then sends the visitor home) and answers `null`:
 * nothing to render, the page is going away. A 403 is `"forbidden"`, the
 * rest `"failed"`.
 */
export function toAdminError(err: unknown): AdminError | null {
  if (err instanceof UnauthorizedError) {
    clearSession();
    return null;
  }
  if (err instanceof ApiError && err.status === 403) return "forbidden";
  return "failed";
}
