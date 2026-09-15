import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { makeJwt, nowInSeconds } from "@/test/jwt";
import {
  CognitoError,
  base64Url,
  buildAuthorizeUrl,
  buildLogoutUrl,
  callbackUrl,
  completeCognitoLogin,
  ensureFreshToken,
  isCognitoAvailable,
  needsRefresh,
  pkceChallenge,
  randomString,
  refreshCognitoSession,
  startCognitoLogin,
  takePending,
} from "./cognito";
import {
  REFRESH_TOKEN_STORAGE_KEY,
  TOKEN_STORAGE_KEY,
  readSession,
  writeSession,
} from "./session";

// The module reads its configuration at import time; these tests set it
// before importing (vitest hoists `vi.stubEnv` calls made in the module scope
// only through setup files), so we stub and re-import per suite instead.
const DOMAIN = "auth.example.com";
const CLIENT_ID = "client-123";

const user = { id: "sub-1", email: "ada@example.com", name: "Ada", picture: undefined };

function idToken(exp = nowInSeconds() + 3600, claims: Record<string, unknown> = {}) {
  return makeJwt({ sub: "sub-1", email: "ada@example.com", name: "Ada", exp, ...claims });
}

function tokenResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status });
}

describe("cognito service", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  describe("PKCE helpers", () => {
    it("encodes bytes as unpadded base64url", () => {
      expect(base64Url(new Uint8Array([251, 255, 191]))).toBe("-_-_");
      expect(base64Url(new Uint8Array([1]))).toBe("AQ");
    });

    it("derives the S256 challenge of a verifier (RFC 7636 appendix B)", async () => {
      const verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
      expect(await pkceChallenge(verifier)).toBe("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
    });

    it("produces distinct, URL-safe random strings", () => {
      const a = randomString();
      const b = randomString();
      expect(a).not.toBe(b);
      expect(a).toMatch(/^[A-Za-z0-9_-]+$/);
    });
  });

  describe("configured build", () => {
    beforeEach(() => {
      vi.stubEnv("NEXT_PUBLIC_COGNITO_DOMAIN", `https://${DOMAIN}/`);
      vi.stubEnv("NEXT_PUBLIC_COGNITO_CLIENT_ID", CLIENT_ID);
      vi.resetModules();
    });

    async function load() {
      return import("./cognito");
    }

    it("is available and builds the authorize, callback and logout URLs", async () => {
      const cognito = await load();
      expect(cognito.isCognitoAvailable()).toBe(true);
      expect(cognito.callbackUrl("http://localhost:3000")).toBe(
        "http://localhost:3000/auth/callback/"
      );

      const url = new URL(
        cognito.buildAuthorizeUrl({
          challenge: "chal",
          state: "st",
          redirectUri: "http://localhost:3000/auth/callback/",
        })
      );
      expect(url.origin + url.pathname).toBe(`https://${DOMAIN}/oauth2/authorize`);
      expect(Object.fromEntries(url.searchParams)).toEqual({
        client_id: CLIENT_ID,
        response_type: "code",
        scope: "openid email profile",
        redirect_uri: "http://localhost:3000/auth/callback/",
        state: "st",
        code_challenge: "chal",
        code_challenge_method: "S256",
        identity_provider: "Google",
      });

      const logout = new URL(cognito.buildLogoutUrl("http://localhost:3000"));
      expect(logout.pathname).toBe("/logout");
      expect(logout.searchParams.get("logout_uri")).toBe("http://localhost:3000/");
    });

    it("starts a login: remembers verifier, state and redirect, then leaves", async () => {
      const cognito = await load();
      const assign = vi.fn();
      vi.stubGlobal("location", { origin: "http://localhost:3000", assign });

      await cognito.startCognitoLogin("/trip/japan");

      const [target] = assign.mock.calls[0] as [string];
      const url = new URL(target);
      const pending = cognito.takePending();
      expect(pending?.redirect).toBe("/trip/japan");
      expect(url.searchParams.get("state")).toBe(pending?.state);
      expect(url.searchParams.get("code_challenge")).toBe(
        await cognito.pkceChallenge(pending!.verifier)
      );
    });

    it("completes a login: exchanges the code with the verifier and stores the session", async () => {
      const cognito = await load();
      vi.stubGlobal("location", { origin: "http://localhost:3000", assign: vi.fn() });
      sessionStorage.setItem(
        "travel_ai_cognito_pending",
        JSON.stringify({ verifier: "ver", state: "st", redirect: "/dashboard/" })
      );
      const fetchMock = vi.fn().mockResolvedValue(
        tokenResponse({
          id_token: idToken(),
          access_token: "acc",
          refresh_token: "ref",
          expires_in: 3600,
          token_type: "Bearer",
        })
      );
      vi.stubGlobal("fetch", fetchMock);

      const result = await cognito.completeCognitoLogin(
        new URLSearchParams({ code: "the-code", state: "st" })
      );

      expect(result).toEqual({ user, redirect: "/dashboard/" });
      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(`https://${DOMAIN}/oauth2/token`);
      expect(Object.fromEntries(init.body as URLSearchParams)).toEqual({
        client_id: CLIENT_ID,
        grant_type: "authorization_code",
        code: "the-code",
        redirect_uri: "http://localhost:3000/auth/callback/",
        code_verifier: "ver",
      });
      expect(readSession().profile).toEqual(user);
      expect(localStorage.getItem(REFRESH_TOKEN_STORAGE_KEY)).toBe("ref");
      expect(sessionStorage.getItem("travel_ai_cognito_pending")).toBeNull();
    });

    it("refuses a callback whose state does not match, and never calls the pool", async () => {
      const cognito = await load();
      const fetchMock = vi.fn();
      vi.stubGlobal("fetch", fetchMock);
      sessionStorage.setItem(
        "travel_ai_cognito_pending",
        JSON.stringify({ verifier: "ver", state: "st", redirect: null })
      );

      await expect(
        cognito.completeCognitoLogin(new URLSearchParams({ code: "c", state: "other" }))
      ).rejects.toBeInstanceOf(cognito.CognitoError);
      expect(fetchMock).not.toHaveBeenCalled();
      expect(readSession()).toEqual({ token: null, profile: null });
    });

    it("surfaces the pool's error and a refused exchange", async () => {
      const cognito = await load();
      await expect(
        cognito.completeCognitoLogin(
          new URLSearchParams({ error: "access_denied", error_description: "nope" })
        )
      ).rejects.toThrow("nope");

      sessionStorage.setItem(
        "travel_ai_cognito_pending",
        JSON.stringify({ verifier: "ver", state: "st", redirect: null })
      );
      vi.stubGlobal("location", { origin: "http://localhost:3000" });
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(tokenResponse({ error: "invalid_grant" }, 400))
      );
      await expect(
        cognito.completeCognitoLogin(new URLSearchParams({ code: "c", state: "st" }))
      ).rejects.toThrow(/invalid_grant/);
    });

    it("refreshes an expiring ID token with the refresh token, sharing one request", async () => {
      const cognito = await load();
      writeSession(idToken(nowInSeconds() + 30), user, "ref");
      const fresh = idToken(nowInSeconds() + 3600);
      const fetchMock = vi.fn().mockResolvedValue(
        tokenResponse({ id_token: fresh, access_token: "a", expires_in: 3600, token_type: "Bearer" })
      );
      vi.stubGlobal("fetch", fetchMock);

      expect(cognito.needsRefresh()).toBe(true);
      await Promise.all([cognito.ensureFreshToken(), cognito.ensureFreshToken()]);

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(Object.fromEntries(init.body as URLSearchParams)).toEqual({
        client_id: CLIENT_ID,
        grant_type: "refresh_token",
        refresh_token: "ref",
      });
      expect(localStorage.getItem(TOKEN_STORAGE_KEY)).toBe(fresh);
      expect(localStorage.getItem(REFRESH_TOKEN_STORAGE_KEY)).toBe("ref");
      expect(cognito.needsRefresh()).toBe(false);
    });

    it("ends the session when the refresh is refused", async () => {
      const cognito = await load();
      writeSession(idToken(nowInSeconds() - 10), user, "ref");
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(tokenResponse({ error: "invalid_grant" }, 400))
      );

      expect(await cognito.refreshCognitoSession()).toBeNull();
      expect(readSession()).toEqual({ token: null, profile: null });
      expect(localStorage.getItem(REFRESH_TOKEN_STORAGE_KEY)).toBeNull();
    });

    it("does not refresh a token that is still fresh, nor without a refresh token", async () => {
      const cognito = await load();
      const fetchMock = vi.fn();
      vi.stubGlobal("fetch", fetchMock);

      writeSession(idToken(), user, "ref");
      await cognito.ensureFreshToken();
      writeSession(idToken(nowInSeconds() - 10), user, null);
      await cognito.ensureFreshToken();

      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe("unconfigured build (the statically imported module)", () => {
    it("is unavailable and never needs a refresh", async () => {
      writeSession(idToken(nowInSeconds() - 10), user, "ref");
      expect(isCognitoAvailable()).toBe(false);
      expect(needsRefresh()).toBe(false);
      const fetchMock = vi.fn();
      vi.stubGlobal("fetch", fetchMock);
      await ensureFreshToken();
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("still exposes pure helpers", () => {
      expect(callbackUrl("https://x.test")).toBe("https://x.test/auth/callback/");
      expect(buildAuthorizeUrl({ challenge: "c", state: "s", redirectUri: "r" })).toContain(
        "/oauth2/authorize?"
      );
      expect(buildLogoutUrl("https://x.test")).toContain("/logout?");
      expect(takePending()).toBeNull();
      expect(new CognitoError().name).toBe("CognitoError");
      expect(typeof startCognitoLogin).toBe("function");
      expect(typeof completeCognitoLogin).toBe("function");
      expect(typeof refreshCognitoSession).toBe("function");
    });
  });
});
