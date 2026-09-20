/**
 * Accepts a destination only if it is a same-origin path: it must start with a
 * single `/` (so `//evil.com`, `/\evil.com` and `https://evil.com` are all
 * rejected). Takes the path as it will be handed to the router — already
 * decoded, its own query string still encoded.
 */
export function safeRedirectTarget(path: string | null | undefined): string | null {
  if (!path) return null;
  if (!path.startsWith("/")) return null;
  if (path.startsWith("//") || path.startsWith("/\\")) return null;
  return path;
}

/**
 * Validates a `?redirect=` query value before handing it to the router.
 *
 * The same rules as `safeRedirectTarget`, plus one `decodeURIComponent` for
 * callers that read the raw query (`useSearchParams` has decoded it once
 * already). Returns `null` for anything else, including values that fail to
 * decode.
 */
export function safeRedirectPath(raw: string | null | undefined): string | null {
  if (!raw) return null;

  let path: string;
  try {
    path = decodeURIComponent(raw);
  } catch {
    return null;
  }

  return safeRedirectTarget(path);
}
