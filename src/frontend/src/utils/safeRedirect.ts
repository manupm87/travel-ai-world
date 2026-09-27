/** Any origin will do: only whether a path leaves it matters. */
const BASE = "https://kyrian.invalid";

/**
 * Accepts a destination only if it is a same-origin path, and returns it
 * unchanged. It must start with `/` and still be on this origin once resolved
 * the way the router resolves it: the URL parser drops tabs and newlines and
 * reads `\` as `/`, so `/\t/evil.com` is `//evil.com` to the router. That, like
 * `//evil.com`, `/\evil.com` and `https://evil.com`, is rejected. Takes the
 * path as it will be handed to the router: already decoded once (as
 * `URLSearchParams.get` returns it), its own query string still encoded.
 */
export function safeRedirectTarget(path: string | null | undefined): string | null {
  if (!path || !path.startsWith("/")) return null;
  if (path.startsWith("//") || path.startsWith("/\\")) return null;
  let resolved: URL;
  try {
    resolved = new URL(path, BASE);
  } catch {
    return null;
  }
  return resolved.origin === BASE ? path : null;
}
