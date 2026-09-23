/**
 * The only owner of the persisted session.
 *
 * Three `localStorage` keys, written together and cleared together:
 * - `travel_ai_token`: the bearer token `http.ts` sends to the backend. Our
 *   own JWT in local (Google) mode, the Cognito ID token in Cognito mode, the
 *   raw Google credential in static mode.
 * - `travel_ai_user`: the profile shown in the UI, cached at login time
 *   because our local JWT carries only `{ sub, exp }`.
 * - `travel_ai_refresh_token`: Cognito's refresh token, when there is one;
 *   `services/cognito.ts` trades it for a new ID token before the old one expires.
 *
 * Everything else (contexts, `http.ts`) reads through this module, and React
 * subscribes to it with `useSyncExternalStore` via `subscribe`/`getSnapshot`.
 */

import { jwtDecode } from "jwt-decode";
import type { User } from "@/types/user";
import { createLocalStorageStore } from "@/utils/localStorageStore";

export const TOKEN_STORAGE_KEY = "travel_ai_token";
export const USER_STORAGE_KEY = "travel_ai_user";
export const REFRESH_TOKEN_STORAGE_KEY = "travel_ai_refresh_token";

const tokenStore = createLocalStorageStore(TOKEN_STORAGE_KEY);
const userStore = createLocalStorageStore(USER_STORAGE_KEY);
const refreshStore = createLocalStorageStore(REFRESH_TOKEN_STORAGE_KEY);

export interface StoredSession {
  token: string | null;
  profile: User | null;
}

/** The ID token claims this app relies on (Google and Cognito issue the same names). */
interface IdTokenClaims {
  sub: string;
  email: string;
  name?: string;
  picture?: string;
  exp?: number;
}

/** Parses the cached profile; `null` when absent or not valid JSON. */
function parseProfile(raw: string | null): User | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as User;
  } catch {
    return null;
  }
}

function expiryOf(token: string): number | undefined {
  return jwtDecode<{ exp?: number }>(token).exp;
}

/** True for a well-formed JWT whose `exp` (if any) is still in the future. */
export function isTokenUsable(token: string): boolean {
  try {
    const exp = expiryOf(token);
    return exp === undefined || exp > Date.now() / 1000;
  } catch {
    return false;
  }
}

/** True when the token is malformed, expired, or expires within `seconds`. */
export function tokenExpiresWithin(token: string, seconds: number): boolean {
  try {
    const exp = expiryOf(token);
    return exp !== undefined && exp - seconds <= Date.now() / 1000;
  } catch {
    return true;
  }
}

/**
 * Decodes an OpenID Connect ID token client-side. `null` when malformed or
 * expired. No signature check happens here: the backend verifies the token
 * on every call; the browser only needs the profile to display.
 */
export function userFromIdToken(token: string): User | null {
  let claims: IdTokenClaims;
  try {
    claims = jwtDecode<IdTokenClaims>(token);
  } catch {
    return null;
  }
  if (claims.exp !== undefined && claims.exp < Date.now() / 1000) return null;
  if (!claims.sub) return null;
  return {
    id: claims.sub,
    email: claims.email,
    name: claims.name ?? "",
    picture: claims.picture,
  };
}

function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

/** Raw storage contents, without any policy applied. */
export function readSession(): StoredSession {
  return { token: tokenStore.read(), profile: parseProfile(userStore.read()) };
}

/** The bearer token, or `null` when signed out (or during SSR). */
export function readToken(): string | null {
  return tokenStore.read();
}

/** Cognito's refresh token, or `null` when there is none. */
export function readRefreshToken(): string | null {
  return refreshStore.read();
}

/** Persists a signed-in session and notifies subscribers. */
export function writeSession(
  token: string,
  user: User,
  refreshToken: string | null = null
): void {
  // Profile first: a token seen without its profile would resolve to nobody.
  userStore.write(JSON.stringify(user));
  if (refreshToken) refreshStore.write(refreshToken);
  else refreshStore.remove();
  tokenStore.write(token);
}

/** Replaces the bearer token of the current session (a refresh), keeping the rest. */
export function writeToken(token: string): void {
  tokenStore.write(token);
}

/**
 * Merges `patch` into the stored profile (the role `core_api` reports, TRA-222),
 * keeping the token and the refresh token as they are. Does nothing when there
 * is no profile to patch, and writes nothing when the patch changes nothing.
 */
export function updateStoredUser(patch: Partial<User>): void {
  const raw = userStore.read();
  const profile = parseProfile(raw);
  if (!profile) return;
  const json = JSON.stringify({ ...profile, ...patch });
  if (json !== raw) userStore.write(json);
}

/** Signs out locally and notifies subscribers. */
export function clearSession(): void {
  tokenStore.remove();
  userStore.remove();
  refreshStore.remove();
}

export function subscribe(listener: () => void): () => void {
  const unsubscribeToken = tokenStore.subscribe(listener);
  const unsubscribeUser = userStore.subscribe(listener);
  return () => {
    unsubscribeToken();
    unsubscribeUser();
  };
}

/**
 * Resolves the stored credentials into the signed-in user. Pure.
 *
 * - With a token: the token must be usable, and the cached profile is the user.
 * - Without a token: only outside production may a bare profile sign someone
 *   in (dev/E2E mocking by writing `travel_ai_user` by hand).
 */
export function resolveUser(
  { token, profile }: StoredSession,
  isProd: boolean
): User | null {
  if (token) return isTokenUsable(token) ? profile : null;
  return isProd ? null : profile;
}

let cachedKey: string | null = null;
let cachedUser: User | null = null;

/**
 * The signed-in user, memoised on the raw storage contents so React sees a
 * stable reference between changes (a requirement of `useSyncExternalStore`).
 */
export function getSnapshot(): User | null {
  const token = tokenStore.read();
  const profileJson = userStore.read();
  const isProd = isProduction();

  const key = [token, profileJson, isProd].join(" ");
  if (key !== cachedKey) {
    cachedKey = key;
    cachedUser = resolveUser({ token, profile: parseProfile(profileJson) }, isProd);
  }
  return cachedUser;
}

/** The server has no localStorage, so it always renders as signed out. */
export function getServerSnapshot(): User | null {
  return null;
}

/**
 * Drops credentials the snapshot refuses to trust, so an expired or corrupt
 * session does not survive the reload that revealed it. Call once on mount.
 * An expired token backed by a refresh token is kept: the refresh decides.
 */
export function pruneInvalidSession(): void {
  const { token, profile } = readSession();

  if (token) {
    if (!isTokenUsable(token) && !readRefreshToken()) clearSession();
    return;
  }

  if (!isProduction() && userStore.read() !== null && profile === null) {
    userStore.remove();
  }
}
