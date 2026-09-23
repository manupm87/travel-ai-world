import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import React from "react";
import { AuthProvider, useAuth } from "./AuthContext";
import { loginWithGoogle } from "@/services/auth";
import {
  completeCognitoLogin,
  isCognitoAvailable,
  logoutFromCognito,
  needsRefresh,
  refreshCognitoSession,
  startCognitoLogin,
} from "@/services/cognito";
import { isApiAvailable } from "@/services/http";
import { writeSession, writeToken } from "@/services/session";
import { getMe } from "@/services/users";
import { ADMIN_USER_PAGE } from "@/test/fixtures/admin";
import { makeJwt, nowInSeconds } from "@/test/jwt";

vi.mock("@/services/auth", () => ({
  loginWithGoogle: vi.fn(),
}));

vi.mock("@/services/cognito", () => ({
  isCognitoAvailable: vi.fn(() => false),
  needsRefresh: vi.fn(() => false),
  refreshCognitoSession: vi.fn(),
  startCognitoLogin: vi.fn(),
  completeCognitoLogin: vi.fn(),
  logoutFromCognito: vi.fn(),
}));

vi.mock("@/services/users", () => ({
  getMe: vi.fn(),
}));

vi.mock("@/services/http", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/http")>()),
  isApiAvailable: vi.fn(() => false),
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

  it("reports the Google provider when no user pool is configured", () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    expect(result.current.provider).toBe("google");
  });

  describe("in Cognito mode", () => {
    beforeEach(() => {
      vi.mocked(isCognitoAvailable).mockReturnValue(true);
    });

    afterEach(() => {
      vi.mocked(isCognitoAvailable).mockReturnValue(false);
      vi.mocked(needsRefresh).mockReturnValue(false);
    });

    it("delegates the redirect login, the callback and the logout to the service", async () => {
      vi.mocked(completeCognitoLogin).mockResolvedValue({ user, redirect: "/trip/japan" });
      const { result } = renderHook(() => useAuth(), { wrapper });
      expect(result.current.provider).toBe("cognito");

      await act(async () => {
        await result.current.loginWithRedirect("/trip/japan");
      });
      expect(startCognitoLogin).toHaveBeenCalledWith("/trip/japan");

      const params = new URLSearchParams({ code: "c", state: "s" });
      let redirect: string | null = null;
      await act(async () => {
        redirect = await result.current.completeLogin(params);
      });
      expect(completeCognitoLogin).toHaveBeenCalledWith(params);
      expect(redirect).toBe("/trip/japan");

      act(() => {
        result.current.logout();
      });
      expect(logoutFromCognito).toHaveBeenCalled();
    });

    it("stays loading while an expired session is being refreshed", async () => {
      writeSession(makeJwt({ sub: "123", exp: 1 }), user, "refresh-1");
      vi.mocked(needsRefresh).mockReturnValue(true);
      let finish!: () => void;
      vi.mocked(refreshCognitoSession).mockImplementation(
        () =>
          new Promise((resolve) => {
            finish = () => {
              writeToken(validToken);
              resolve(validToken);
            };
          })
      );

      const { result } = renderHook(() => useAuth(), { wrapper });
      expect(result.current.isLoading).toBe(true);
      expect(result.current.user).toBeNull();

      await act(async () => {
        finish();
      });

      expect(result.current.isLoading).toBe(false);
      expect(result.current.user).toEqual(user);
    });
  });

  describe("the account's role", () => {
    const admin = ADMIN_USER_PAGE.items[0]!;

    beforeEach(() => {
      vi.mocked(isApiAvailable).mockReturnValue(true);
    });

    afterEach(() => {
      vi.mocked(isApiAvailable).mockReturnValue(false);
    });

    it("asks core_api once on restore and merges the role into the profile", async () => {
      vi.mocked(getMe).mockResolvedValue(admin);
      writeSession(validToken, user);

      const { result } = renderHook(() => useAuth(), { wrapper });
      expect(result.current.isAdmin).toBe(false);

      await waitFor(() => expect(result.current.isAdmin).toBe(true));
      expect(result.current.user).toEqual({ ...user, role: "admin" });
      expect(JSON.parse(localStorage.getItem("travel_ai_user")!)).toMatchObject({ role: "admin" });
      expect(getMe).toHaveBeenCalledTimes(1);
    });

    it("asks right after a login", async () => {
      vi.mocked(getMe).mockResolvedValue({ ...admin, role: "user" });
      const { result } = renderHook(() => useAuth(), { wrapper });
      expect(getMe).not.toHaveBeenCalled();

      await act(async () => {
        await result.current.login(validToken);
      });

      await waitFor(() => expect(result.current.user?.role).toBe("user"));
      expect(result.current.isAdmin).toBe(false);
    });

    it("keeps the stored role when the call fails, and never asks without an API", async () => {
      vi.mocked(getMe).mockRejectedValue(new Error("offline"));
      writeSession(validToken, { ...user, role: "admin" });

      const { result } = renderHook(() => useAuth(), { wrapper });
      await waitFor(() => expect(getMe).toHaveBeenCalled());
      expect(result.current.isAdmin).toBe(true);
    });

    it("does not ask when no API is configured", () => {
      vi.mocked(isApiAvailable).mockReturnValue(false);
      writeSession(validToken, user);
      renderHook(() => useAuth(), { wrapper });
      expect(getMe).not.toHaveBeenCalled();
    });
  });

  it("throws when used outside the provider", () => {
    expect(() => renderHook(() => useAuth())).toThrow(/within an AuthProvider/);
  });
});
