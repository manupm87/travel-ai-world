/**
 * Sign-in through the Amazon Cognito user pool (ADR 0009).
 *
 * Authorization code flow with PKCE, no client secret and no SDK: the browser
 * is sent to the pool's managed login (which hands off to Google), comes back
 * to `/auth/callback/` with a one-time code, and this module exchanges the
 * code for tokens. The **ID token** is what the backend expects as bearer;
 * the refresh token renews it silently until the user logs out.
 *
 * Configured by `NEXT_PUBLIC_COGNITO_DOMAIN` (the managed login host) and
 * `NEXT_PUBLIC_COGNITO_CLIENT_ID`. Without them the app falls back to the
 * local Google flow (`services/auth.ts`).
 */

import type { User } from "@/types/user";
import {
  clearSession,
  readRefreshToken,
  readToken,
  tokenExpiresWithin,
  userFromIdToken,
  writeSession,
  writeToken,
} from "./session";

const DOMAIN = (process.env.NEXT_PUBLIC_COGNITO_DOMAIN ?? "").replace(/^https?:\/\//, "").replace(/\/$/, "");
const CLIENT_ID = process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID ?? "";
// Mirrors next.config.ts: the export may live under a base path in production.
const BASE_PATH =
  process.env.NODE_ENV === "production" ? (process.env.NEXT_PUBLIC_BASE_PATH ?? "") : "";

export const CALLBACK_PATH = "/auth/callback/";
const SCOPES = "openid email profile";
/** Skips the pool's provider chooser: Google is the only identity provider. */
const IDENTITY_PROVIDER = "Google";
/** Renew the ID token this many seconds before it expires. */
const REFRESH_MARGIN_SECONDS = 60;
const PENDING_KEY = "travel_ai_cognito_pending";

/** Raised when the pool refuses a request or the callback does not match a login we started. */
export class CognitoError extends Error {
  constructor(message = "Cognito sign-in failed") {
    super(message);
    this.name = "CognitoError";
  }
}

/** True when the build points at a user pool. */
export function isCognitoAvailable(): boolean {
  return DOMAIN.length > 0 && CLIENT_ID.length > 0;
}

/** The redirect URI registered on the app client, for this origin. */
export function callbackUrl(origin: string): string {
  return `${origin}${BASE_PATH}${CALLBACK_PATH}`;
}

// ── PKCE (RFC 7636) ──────────────────────────────────────────────────────────

export function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function randomString(byteLength = 32): string {
  return base64Url(crypto.getRandomValues(new Uint8Array(byteLength)));
}

/** `code_challenge` = base64url(SHA-256(verifier)). */
export async function pkceChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return base64Url(new Uint8Array(digest));
}

// ── The login we started, remembered across the redirect ────────────────────

export interface PendingLogin {
  verifier: string;
  state: string;
  /** Same-origin path to land on afterwards; `null` means the dashboard. */
  redirect: string | null;
}

function savePending(pending: PendingLogin): void {
  sessionStorage.setItem(PENDING_KEY, JSON.stringify(pending));
}

export function takePending(): PendingLogin | null {
  let raw: string | null;
  try {
    raw = sessionStorage.getItem(PENDING_KEY);
    sessionStorage.removeItem(PENDING_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    return JSON.parse(raw) as PendingLogin;
  } catch {
    return null;
  }
}

// ── Endpoints ────────────────────────────────────────────────────────────────

export interface AuthorizeParams {
  challenge: string;
  state: string;
  redirectUri: string;
}

/** The managed login URL for one login attempt. Pure. */
export function buildAuthorizeUrl({ challenge, state, redirectUri }: AuthorizeParams): string {
  const query = new URLSearchParams({
    client_id: CLIENT_ID,
    response_type: "code",
    scope: SCOPES,
    redirect_uri: redirectUri,
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
    identity_provider: IDENTITY_PROVIDER,
  });
  return `https://${DOMAIN}/oauth2/authorize?${query.toString()}`;
}

/** Where to send the browser so the pool forgets its session too. Pure. */
export function buildLogoutUrl(origin: string): string {
  const query = new URLSearchParams({
    client_id: CLIENT_ID,
    logout_uri: `${origin}${BASE_PATH}/`,
  });
  return `https://${DOMAIN}/logout?${query.toString()}`;
}

interface TokenResponse {
  id_token: string;
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
}

async function tokenRequest(params: Record<string, string>): Promise<TokenResponse> {
  const res = await fetch(`https://${DOMAIN}/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: CLIENT_ID, ...params }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: unknown } | null;
    const reason = typeof body?.error === "string" ? body.error : `status ${res.status}`;
    throw new CognitoError(`Token endpoint refused the request (${reason})`);
  }
  return res.json() as Promise<TokenResponse>;
}

// ── Flow ─────────────────────────────────────────────────────────────────────

/**
 * Leaves the page for the pool's managed login. Resolves only if navigation
 * could not start (the caller then shows an error).
 */
export async function startCognitoLogin(redirect: string | null): Promise<void> {
  const verifier = randomString(48);
  const state = randomString(16);
  const challenge = await pkceChallenge(verifier);
  savePending({ verifier, state, redirect });
  window.location.assign(
    buildAuthorizeUrl({ challenge, state, redirectUri: callbackUrl(window.location.origin) })
  );
}

export interface CompletedLogin {
  user: User;
  redirect: string | null;
}

/**
 * Handles the callback query: exchanges the code for tokens and persists the
 * session. Throws `CognitoError` when the pool reported an error, when the
 * `state` does not match the login we started, or when the exchange fails.
 */
export async function completeCognitoLogin(params: URLSearchParams): Promise<CompletedLogin> {
  const pending = takePending();
  const error = params.get("error");
  if (error) throw new CognitoError(params.get("error_description") ?? error);

  const code = params.get("code");
  if (!code || !pending || params.get("state") !== pending.state) {
    throw new CognitoError("This sign-in was not started here");
  }

  const tokens = await tokenRequest({
    grant_type: "authorization_code",
    code,
    redirect_uri: callbackUrl(window.location.origin),
    code_verifier: pending.verifier,
  });
  const user = userFromIdToken(tokens.id_token);
  if (!user) throw new CognitoError("The ID token is not usable");

  writeSession(tokens.id_token, user, tokens.refresh_token ?? null);
  return { user, redirect: pending.redirect };
}

let inFlightRefresh: Promise<string | null> | null = null;

/**
 * Trades the refresh token for a new ID token. Concurrent callers share one
 * request. A refused refresh (revoked, expired) ends the session: `null`.
 */
export function refreshCognitoSession(): Promise<string | null> {
  if (inFlightRefresh) return inFlightRefresh;
  const refreshToken = readRefreshToken();
  if (!refreshToken) return Promise.resolve(null);

  inFlightRefresh = tokenRequest({ grant_type: "refresh_token", refresh_token: refreshToken })
    .then((tokens) => {
      writeToken(tokens.id_token);
      return tokens.id_token;
    })
    .catch(() => {
      clearSession();
      return null;
    })
    .finally(() => {
      inFlightRefresh = null;
    });
  return inFlightRefresh;
}

/** True when a refresh is needed to have a usable token: expired or about to. */
export function needsRefresh(): boolean {
  if (!isCognitoAvailable() || !readRefreshToken()) return false;
  const token = readToken();
  return token === null || tokenExpiresWithin(token, REFRESH_MARGIN_SECONDS);
}

/** Renews the ID token if it is about to expire; a no-op otherwise. */
export async function ensureFreshToken(): Promise<void> {
  if (needsRefresh()) await refreshCognitoSession();
}

/** Clears the local session and sends the browser to the pool's logout. */
export function logoutFromCognito(): void {
  clearSession();
  window.location.assign(buildLogoutUrl(window.location.origin));
}
