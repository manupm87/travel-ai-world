/**
 * Validates a `?redirect=` query value before handing it to the router.
 *
 * Only same-origin paths are accepted: they must start with a single `/`
 * (so `//evil.com`, `/\evil.com` and `https://evil.com` are all rejected).
 * Returns `null` for anything else, including values that fail to decode.
 */
export function safeRedirectPath(raw: string | null | undefined): string | null {
  if (!raw) return null;

  let path: string;
  try {
    path = decodeURIComponent(raw);
  } catch {
    return null;
  }

  if (!path.startsWith("/")) return null;
  if (path.startsWith("//") || path.startsWith("/\\")) return null;
  return path;
}
