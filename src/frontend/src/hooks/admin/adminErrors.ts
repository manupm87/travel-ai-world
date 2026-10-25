/** The errors the admin console's reads can fail with. */

import { ApiError, UnauthorizedError } from "@/services/http";
import { clearSession } from "@/services/session";

/** What an admin read can fail with, as the console says it. */
export type AdminError = "forbidden" | "failed";

/**
 * Turns a failed admin read into what the page shows: a 403 is `"forbidden"`, the rest `"failed"`.
 * A 401 clears the session and answers `null`: the route guard sends the visitor home.
 */
export function toAdminError(err: unknown): AdminError | null {
  if (err instanceof UnauthorizedError) {
    clearSession();
    return null;
  }
  if (err instanceof ApiError && err.status === 403) return "forbidden";
  return "failed";
}
