import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { makeJwt, nowInSeconds } from "@/test/jwt";
import {
  TOKEN_STORAGE_KEY,
  USER_STORAGE_KEY,
  clearSession,
  getServerSnapshot,
  getSnapshot,
  isTokenUsable,
  pruneInvalidSession,
  readSession,
  readToken,
  resolveUser,
  subscribe,
  writeSession,
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

  it("clears both keys", () => {
    writeSession(validToken, user);
    clearSession();
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
