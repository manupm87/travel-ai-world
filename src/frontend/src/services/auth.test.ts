import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { makeJwt, nowInSeconds } from "@/test/jwt";
import {
  InvalidCredentialError,
  loginWithGoogle,
  userFromAuthResponse,
  userFromGoogleCredential,
} from "./auth";
import { readSession } from "./session";

let apiAvailable = false;

vi.mock("./http", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./http")>();
  return { ...actual, isApiAvailable: () => apiAvailable };
});

const googleClaims = {
  sub: "google-123",
  email: "ada@example.com",
  name: "Ada Lovelace",
  picture: "https://example.com/ada.png",
  exp: nowInSeconds() + 3600,
};
const googleCredential = makeJwt(googleClaims);

const authResponse = {
  access_token: "our-jwt",
  token_type: "bearer",
  user: {
    id: 42,
    email: "ada@example.com",
    name: null,
    picture: null,
    created_at: "2026-01-01T00:00:00Z",
  },
};

describe("auth service", () => {
  beforeEach(() => {
    localStorage.clear();
    apiAvailable = false;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("userFromGoogleCredential", () => {
    it("maps the ID token claims to a User", () => {
      expect(userFromGoogleCredential(googleCredential)).toEqual({
        id: "google-123",
        email: "ada@example.com",
        name: "Ada Lovelace",
        picture: "https://example.com/ada.png",
      });
    });

    it("rejects expired and malformed credentials", () => {
      const expired = makeJwt({ ...googleClaims, exp: nowInSeconds() - 1 });
      expect(userFromGoogleCredential(expired)).toBeNull();
      expect(userFromGoogleCredential("garbage")).toBeNull();
      expect(userFromGoogleCredential(makeJwt({ email: "x" }))).toBeNull();
    });
  });

  describe("userFromAuthResponse", () => {
    it("normalises ids to strings and nulls to optional fields", () => {
      expect(userFromAuthResponse(authResponse)).toEqual({
        id: "42",
        email: "ada@example.com",
        name: "",
        picture: undefined,
      });
    });
  });

  describe("loginWithGoogle in static mode", () => {
    it("stores the credential itself as the token", async () => {
      const user = await loginWithGoogle(googleCredential);

      expect(user.id).toBe("google-123");
      expect(readSession()).toEqual({ token: googleCredential, profile: user });
    });

    it("throws and leaves storage empty for an invalid credential", async () => {
      await expect(loginWithGoogle("not-a-jwt")).rejects.toBeInstanceOf(
        InvalidCredentialError
      );
      expect(readSession()).toEqual({ token: null, profile: null });
    });
  });

  describe("loginWithGoogle in API mode", () => {
    beforeEach(() => {
      apiAvailable = true;
    });

    it("verifies with core_api and stores our JWT plus the mapped profile", async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        new Response(JSON.stringify(authResponse), { status: 200 })
      );
      vi.stubGlobal("fetch", fetchMock);

      const user = await loginWithGoogle(googleCredential);

      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toMatch(/\/api\/v1\/auth\/google$/);
      expect(JSON.parse(init.body as string)).toEqual({ credential: googleCredential });
      expect(user).toEqual({ id: "42", email: "ada@example.com", name: "", picture: undefined });
      expect(readSession()).toEqual({ token: "our-jwt", profile: user });
    });

    it("surfaces the backend message and stores nothing on failure", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(
          new Response(
            JSON.stringify({ detail: { message: "Bad token", error_code: "AUTH" } }),
            { status: 401 }
          )
        )
      );

      await expect(loginWithGoogle(googleCredential)).rejects.toThrow("Bad token");
      expect(readSession()).toEqual({ token: null, profile: null });
    });
  });
});
