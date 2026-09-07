/**
 * Sign-in: turns a Google credential into a persisted session.
 *
 * Two modes, decided here and nowhere else:
 * - API mode (`NEXT_PUBLIC_API_URL` set): core_api verifies the credential and
 *   issues our own JWT, which becomes the stored token.
 * - Static mode (no API URL, e.g. GitHub Pages): the Google ID token is
 *   decoded client-side for profile display only, and stored as the token.
 */

import { jwtDecode } from "jwt-decode";
import type { components } from "@/types/generated/core-api";
import type { User } from "@/types/user";
import { apiUrl, isApiAvailable, readErrorMessage } from "./http";
import { writeSession } from "./session";

export type GoogleAuthResponse = components["schemas"]["GoogleAuthResponse"];

/** The Google ID token claims this app relies on. */
interface GoogleIdTokenClaims {
  sub: string;
  email: string;
  name: string;
  picture?: string;
  exp?: number;
}

/** Raised when a credential cannot be turned into a session. */
export class InvalidCredentialError extends Error {
  constructor(message = "Invalid credential") {
    super(message);
    this.name = "InvalidCredentialError";
  }
}

/**
 * Sends a Google ID token to core_api for verification.
 * Returns our own JWT + user profile on success.
 */
export async function verifyGoogleToken(
  credential: string
): Promise<GoogleAuthResponse> {
  const body: components["schemas"]["GoogleAuthRequest"] = { credential };
  const res = await fetch(apiUrl("core", "/auth/google"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new Error(await readErrorMessage(res, "Auth failed"));
  }

  return res.json();
}

/**
 * core_api ids are integers and profile fields nullable; the UI type is
 * string-keyed and optional, so normalise at the boundary.
 */
export function userFromAuthResponse(response: GoogleAuthResponse): User {
  return {
    id: String(response.user.id),
    email: response.user.email,
    name: response.user.name ?? "",
    picture: response.user.picture ?? undefined,
  };
}

/**
 * Decodes a Google ID token client-side. `null` when malformed or expired.
 * No signature check happens here: static mode trusts the browser session,
 * which is why it never talks to a backend.
 */
export function userFromGoogleCredential(credential: string): User | null {
  let claims: GoogleIdTokenClaims;
  try {
    claims = jwtDecode<GoogleIdTokenClaims>(credential);
  } catch {
    return null;
  }
  if (claims.exp !== undefined && claims.exp < Date.now() / 1000) return null;
  if (!claims.sub) return null;
  return {
    id: claims.sub,
    email: claims.email,
    name: claims.name,
    picture: claims.picture,
  };
}

/**
 * Signs in with a Google credential and persists the session.
 * Rejects (leaving storage untouched) when the credential is not accepted.
 */
export async function loginWithGoogle(credential: string): Promise<User> {
  if (isApiAvailable()) {
    const response = await verifyGoogleToken(credential);
    const user = userFromAuthResponse(response);
    writeSession(response.access_token, user);
    return user;
  }

  const user = userFromGoogleCredential(credential);
  if (!user) throw new InvalidCredentialError();
  writeSession(credential, user);
  return user;
}
