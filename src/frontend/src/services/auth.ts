/**
 * Sign-in with a Google credential (local and static modes).
 *
 * Two modes, decided here and nowhere else:
 * - API mode (`NEXT_PUBLIC_API_URL` set): core_api verifies the credential and
 *   issues our own JWT, which becomes the stored token.
 * - Static mode (no API URL, e.g. GitHub Pages): the Google ID token is
 *   decoded client-side for profile display only, and stored as the token.
 *
 * The deployed app signs in through Cognito instead (`services/cognito.ts`);
 * `AuthContext` picks the flow from the build's configuration.
 */

import type { components } from "@/types/generated/core-api";
import type { User } from "@/types/user";
import { isApiAvailable, request } from "./http";
import { userFromIdToken, writeSession } from "./session";

export type GoogleAuthResponse = components["schemas"]["GoogleAuthResponse"];

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
  return request<GoogleAuthResponse>("core", "/auth/google", {
    method: "POST",
    json: body,
  });
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

/** A Google credential is an OpenID Connect ID token; decode it for display. */
export const userFromGoogleCredential = userFromIdToken;

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
