import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import React from "react";
import { AuthProvider, useAuth } from "./AuthContext";
import { loginWithGoogle } from "@/services/auth";
import { writeSession } from "@/services/session";
import { makeJwt, nowInSeconds } from "@/test/jwt";

vi.mock("@/services/auth", () => ({
  loginWithGoogle: vi.fn(),
}));

const user = {
  id: "123",
  email: "test@example.com",
  name: "Test User",
  picture: "https://example.com/pic.jpg",
};
const validToken = makeJwt({ sub: "123", exp: nowInSeconds() + 3600 });

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <AuthProvider>{children}</AuthProvider>
);

describe("AuthContext", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    vi.mocked(loginWithGoogle).mockImplementation(async (credential) => {
      writeSession(credential, user);
      return user;
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("initialises signed out and not loading once hydrated", () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    expect(result.current.user).toBeNull();
    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.isLoading).toBe(false);
  });

  it("reflects the session written by the auth service on login", async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });

    await act(async () => {
      await result.current.login(validToken);
    });

    expect(loginWithGoogle).toHaveBeenCalledWith(validToken);
    expect(result.current.user).toEqual(user);
    expect(result.current.isAuthenticated).toBe(true);
    expect(localStorage.getItem("travel_ai_token")).toBe(validToken);
  });

  it("propagates login failures and stays signed out", async () => {
    vi.mocked(loginWithGoogle).mockRejectedValue(new Error("Auth failed"));
    const { result } = renderHook(() => useAuth(), { wrapper });

    let failure: unknown;
    await act(async () => {
      failure = await result.current.login("bad").catch((e: unknown) => e);
    });

    expect(failure).toBeInstanceOf(Error);
    expect(result.current.user).toBeNull();
    expect(localStorage.getItem("travel_ai_token")).toBeNull();
  });

  it("rejects a bare profile in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    localStorage.setItem("travel_ai_user", JSON.stringify({ name: "Hacker" }));

    const { result } = renderHook(() => useAuth(), { wrapper });

    expect(result.current.user).toBeNull();
    expect(result.current.isAuthenticated).toBe(false);
  });

  it("accepts a bare profile in development (E2E mocking)", () => {
    vi.stubEnv("NODE_ENV", "development");
    localStorage.setItem("travel_ai_user", JSON.stringify(user));

    const { result } = renderHook(() => useAuth(), { wrapper });

    expect(result.current.user).toEqual(user);
    expect(result.current.isAuthenticated).toBe(true);
  });

  it("restores the cached profile on reload, not the JWT payload", () => {
    localStorage.setItem("travel_ai_token", makeJwt({ sub: "42" }));
    localStorage.setItem("travel_ai_user", JSON.stringify(user));

    const { result } = renderHook(() => useAuth(), { wrapper });

    expect(result.current.user).toEqual(user);
  });

  it("prunes an expired session on mount", () => {
    localStorage.setItem("travel_ai_token", makeJwt({ sub: "42", exp: 1 }));
    localStorage.setItem("travel_ai_user", JSON.stringify(user));

    const { result } = renderHook(() => useAuth(), { wrapper });

    expect(result.current.user).toBeNull();
    expect(localStorage.getItem("travel_ai_token")).toBeNull();
    expect(localStorage.getItem("travel_ai_user")).toBeNull();
  });

  it("logs out by clearing storage, without navigating", async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });

    await act(async () => {
      await result.current.login(validToken);
    });
    act(() => {
      result.current.logout();
    });

    expect(result.current.user).toBeNull();
    expect(localStorage.getItem("travel_ai_token")).toBeNull();
    expect(localStorage.getItem("travel_ai_user")).toBeNull();
  });

  it("throws when used outside the provider", () => {
    expect(() => renderHook(() => useAuth())).toThrow(/within an AuthProvider/);
  });
});
