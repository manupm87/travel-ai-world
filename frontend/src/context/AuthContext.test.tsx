import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { AuthProvider, useAuth } from "./AuthContext";
import React from "react";

// Mock jwt-decode
vi.mock("jwt-decode", () => ({
  jwtDecode: vi.fn(() => ({
    sub: "123",
    email: "test@example.com",
    name: "Test User",
    picture: "https://example.com/pic.jpg",
  })),
}));

// Mock localStorage
const localStorageMock = (function() {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => { store[key] = value.toString(); },
    clear: () => { store = {}; },
    removeItem: (key: string) => { delete store[key]; }
  };
})();

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock
});

describe("AuthContext", () => {

  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <AuthProvider>{children}</AuthProvider>
  );

  it("should initialize with no user", () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    expect(result.current.user).toBeNull();
    expect(result.current.isAuthenticated).toBe(false);
  });

  it("should login and persist user", () => {
    const { result } = renderHook(() => useAuth(), { wrapper });

    act(() => {
      result.current.login("fake-token");
    });

    expect(result.current.user).toEqual({
      id: "123",
      email: "test@example.com",
      name: "Test User",
      picture: "https://example.com/pic.jpg",
    });
    expect(result.current.isAuthenticated).toBe(true);
    expect(localStorage.getItem("travel_ai_user")).toBeTruthy();
  });

  it("should logout and remove persisted user", () => {
    const { result } = renderHook(() => useAuth(), { wrapper });

    act(() => {
      result.current.login("fake-token");
    });

    act(() => {
      result.current.logout();
    });

    expect(result.current.user).toBeNull();
    expect(result.current.isAuthenticated).toBe(false);
    expect(localStorage.getItem("travel_ai_user")).toBeNull();
  });
});
