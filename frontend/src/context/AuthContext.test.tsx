import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { AuthProvider, useAuth } from "./AuthContext";
import React from "react";

// Mock next/navigation
const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

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

  it("should initialize with no user and stop loading", () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    expect(result.current.user).toBeNull();
    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.isLoading).toBe(false);
  });

  it("should login and persist user with token", () => {
    const { result } = renderHook(() => useAuth(), { wrapper });

    act(() => {
      result.current.login("fake-jwt-token");
    });

    expect(result.current.user).toEqual({
      id: "123",
      email: "test@example.com",
      name: "Test User",
      picture: "https://example.com/pic.jpg",
    });
    expect(result.current.isAuthenticated).toBe(true);
    expect(localStorage.getItem("travel_ai_token")).toBe("fake-jwt-token");
  });

  it("should reject plain JSON in production environment", () => {
    // Mock production environment
    vi.stubEnv("NODE_ENV", "production");
    
    localStorage.setItem("travel_ai_user", JSON.stringify({ name: "Hacker" }));
    
    const { result } = renderHook(() => useAuth(), { wrapper });
    
    expect(result.current.user).toBeNull();
    expect(result.current.isAuthenticated).toBe(false);
    
    vi.unstubAllEnvs();
  });

  it("should allow plain JSON in development environment", () => {
    // Mock development environment
    vi.stubEnv("NODE_ENV", "development");
    
    const mockUser = { id: "mock-1", name: "Mock User", email: "mock@example.com", picture: "" };
    localStorage.setItem("travel_ai_user", JSON.stringify(mockUser));
    
    const { result } = renderHook(() => useAuth(), { wrapper });
    
    expect(result.current.user).toEqual(mockUser);
    expect(result.current.isAuthenticated).toBe(true);
    
    vi.unstubAllEnvs();
  });

  it("should logout and remove all storage items", () => {
    const { result } = renderHook(() => useAuth(), { wrapper });

    act(() => {
      result.current.login("fake-jwt-token");
    });

    act(() => {
      result.current.logout();
    });

    expect(result.current.user).toBeNull();
    expect(localStorage.getItem("travel_ai_token")).toBeNull();
    expect(localStorage.getItem("travel_ai_user")).toBeNull();
    expect(mockPush).toHaveBeenCalledWith("/");
  });
});


