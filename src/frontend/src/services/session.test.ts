import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { makeJwt, nowInSeconds } from "@/test/jwt";
import {
  REFRESH_TOKEN_STORAGE_KEY,
  TOKEN_STORAGE_KEY,
  USER_STORAGE_KEY,
  clearSession,
  getServerSnapshot,
  getSnapshot,
  isTokenUsable,
  pruneInvalidSession,
  readRefreshToken,
  readSession,
  readToken,
  resolveUser,
  subscribe,
  tokenExpiresWithin,
  updateStoredUser,
  userFromIdToken,
  writeSession,
  writeToken,
} from "./session";

const user = { id: "1", email: "a@b.c", name: "Ada", picture: undefined };
const validToken = makeJwt({ sub: "1", exp: nowInSeconds() + 3600 });
const expiredToken = makeJwt({ sub: "1", exp: nowInSeconds() - 60 });

describe("session", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("writes both keys and reads them back", () => {
    writeSession(validToken, user);

    expect(localStorage.getItem(TOKEN_STORAGE_KEY)).toBe(validToken);
    expect(JSON.parse(localStorage.getItem(USER_STORAGE_KEY)!)).toEqual(user);
    expect(readToken()).toBe(validToken);
    expect(readSession()).toEqual({ token: validToken, profile: user });
  });

  it("clears every key", () => {
    writeSession(validToken, user, "refresh-1");
    clearSession();
    expect(readSession()).toEqual({ token: null, profile: null });
    expect(readRefreshToken()).toBeNull();
  });

  it("keeps a refresh token only when the login provided one", () => {
    writeSession(validToken, user, "refresh-1");
    expect(localStorage.getItem(REFRESH_TOKEN_STORAGE_KEY)).toBe("refresh-1");

    writeSession(validToken, user);
    expect(readRefreshToken()).toBeNull();
  });

  it("replaces only the bearer token on a refresh", () => {
    writeSession(expiredToken, user, "refresh-1");
    writeToken(validToken);
    expect(readSession()).toEqual({ token: validToken, profile: user });
    expect(readRefreshToken()).toBe("refresh-1");
  });

  describe("tokenExpiresWithin", () => {
    it("is true for expired, soon-to-expire and malformed tokens", () => {
      expect(tokenExpiresWithin(expiredToken, 0)).toBe(true);
      expect(tokenExpiresWithin(makeJwt({ exp: nowInSeconds() + 30 }), 60)).toBe(true);
      expect(tokenExpiresWithin("garbage", 60)).toBe(true);
    });

    it("is false for fresh and expiry-less tokens", () => {
      expect(tokenExpiresWithin(validToken, 60)).toBe(false);
      expect(tokenExpiresWithin(makeJwt({ sub: "1" }), 60)).toBe(false);
    });
  });

  describe("userFromIdToken", () => {
    it("maps the ID token claims to a User", () => {
      const token = makeJwt({
        sub: "sub-1",
        email: "ada@example.com",
        name: "Ada",
        picture: "https://example.com/a.png",
        exp: nowInSeconds() + 60,
      });
      expect(userFromIdToken(token)).toEqual({
        id: "sub-1",
        email: "ada@example.com",
        name: "Ada",
        picture: "https://example.com/a.png",
      });
    });

    it("rejects expired and malformed tokens, and defaults a missing name", () => {
      expect(userFromIdToken(expiredToken)).toBeNull();
      expect(userFromIdToken("garbage")).toBeNull();
      expect(userFromIdToken(makeJwt({ email: "x" }))).toBeNull();
      expect(userFromIdToken(makeJwt({ sub: "1", email: "x" }))?.name).toBe("");
    });
  });

  it("merges a patch into the stored profile and keeps the tokens", () => {
    writeSession(validToken, user, "refresh-1");
    const listener = vi.fn();
    const unsubscribe = subscribe(listener);

    updateStoredUser({ role: "admin" });

    expect(readSession()).toEqual({ token: validToken, profile: { ...user, role: "admin" } });
    expect(readRefreshToken()).toBe("refresh-1");
    expect(listener).toHaveBeenCalled();

    // The same role again changes nothing and notifies nobody.
    listener.mockClear();
    updateStoredUser({ role: "admin" });
    expect(listener).not.toHaveBeenCalled();
    unsubscribe();
  });

  it("patches nothing when there is no profile", () => {
    updateStoredUser({ role: "admin" });
    expect(readSession()).toEqual({ token: null, profile: null });
  });

  it("tolerates a corrupt profile", () => {
    localStorage.setItem(USER_STORAGE_KEY, "{not json");
    expect(readSession().profile).toBeNull();
  });

  it("notifies subscribers on write and clear", () => {
    const listener = vi.fn();
    const unsubscribe = subscribe(listener);

    writeSession(validToken, user);
    expect(listener).toHaveBeenCalled();
    listener.mockClear();

    clearSession();
    expect(listener).toHaveBeenCalled();

    unsubscribe();
    listener.mockClear();
    writeSession(validToken, user);
    expect(listener).not.toHaveBeenCalled();
  });

  describe("isTokenUsable", () => {
    it("accepts unexpired and expiry-less tokens", () => {
      expect(isTokenUsable(validToken)).toBe(true);
      expect(isTokenUsable(makeJwt({ sub: "1" }))).toBe(true);
    });

    it("rejects expired and malformed tokens", () => {
      expect(isTokenUsable(expiredToken)).toBe(false);
      expect(isTokenUsable("not-a-jwt")).toBe(false);
    });
  });

  describe("resolveUser", () => {
    it("returns the cached profile for a usable token", () => {
      expect(resolveUser({ token: validToken, profile: user }, true)).toEqual(user);
    });

    it("returns nobody for an expired token, whatever the profile says", () => {
      expect(resolveUser({ token: expiredToken, profile: user }, false)).toBeNull();
    });

    it("allows a bare profile only outside production", () => {
      expect(resolveUser({ token: null, profile: user }, false)).toEqual(user);
      expect(resolveUser({ token: null, profile: user }, true)).toBeNull();
    });
  });

  describe("getSnapshot", () => {
    it("is null on the server and when signed out", () => {
      expect(getServerSnapshot()).toBeNull();
      expect(getSnapshot()).toBeNull();
    });

    it("returns a stable reference until storage changes", () => {
      writeSession(validToken, user);
      const first = getSnapshot();
      expect(first).toEqual(user);
      expect(getSnapshot()).toBe(first);

      writeSession(validToken, { ...user, name: "Grace" });
      expect(getSnapshot()).not.toBe(first);
      expect(getSnapshot()?.name).toBe("Grace");
    });

    it("rejects a bare profile in production", () => {
      vi.stubEnv("NODE_ENV", "production");
      localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user));
      expect(getSnapshot()).toBeNull();
    });
  });

  describe("pruneInvalidSession", () => {
    it("removes an expired session", () => {
      localStorage.setItem(TOKEN_STORAGE_KEY, expiredToken);
      localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user));
      pruneInvalidSession();
      expect(readSession()).toEqual({ token: null, profile: null });
    });

    it("keeps an expired session that a refresh token can renew", () => {
      writeSession(expiredToken, user, "refresh-1");
      pruneInvalidSession();
      expect(readSession()).toEqual({ token: expiredToken, profile: user });
      expect(readRefreshToken()).toBe("refresh-1");
    });

    it("keeps a valid session", () => {
      writeSession(validToken, user);
      pruneInvalidSession();
      expect(readSession()).toEqual({ token: validToken, profile: user });
    });

    it("removes a corrupt bare profile in development", () => {
      vi.stubEnv("NODE_ENV", "development");
      localStorage.setItem(USER_STORAGE_KEY, "{not json");
      pruneInvalidSession();
      expect(localStorage.getItem(USER_STORAGE_KEY)).toBeNull();
    });
  });
});
