"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
  ReactNode,
} from "react";
import { User } from "@/types/user";
import { jwtDecode } from "jwt-decode";
import { useRouter } from "next/navigation";
import {
  isApiAvailable,
  verifyGoogleToken,
  TOKEN_STORAGE_KEY,
  USER_STORAGE_KEY,
} from "@/services/api";

/** The Google ID token fields this app relies on. */
interface GoogleIdTokenPayload {
  sub: string;
  email: string;
  name: string;
  picture?: string;
  exp?: number;
}

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (credential: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

/**
 * Validates a JWT credential and returns the decoded user if valid.
 * Used as fallback when no backend API is available.
 */
const validateAndDecode = (credential: string): User | null => {
  try {
    const decoded = jwtDecode<GoogleIdTokenPayload>(credential);

    const currentTime = Date.now() / 1000;
    if (decoded.exp && decoded.exp < currentTime) {
      console.warn("Token expired");
      return null;
    }

    return {
      id: decoded.sub,
      email: decoded.email,
      name: decoded.name,
      picture: decoded.picture,
    };
  } catch (error) {
    console.error("Invalid token format:", error);
    return null;
  }
};

/**
 * Reads the profile cached at login time.
 *
 * Our own JWT carries only { sub, exp }
 */
const readStoredProfile = (raw: string | null): User | null => {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as User;
  } catch {
    return null;
  }
};


function readStorageItem(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

const sessionListeners = new Set<() => void>();

function emitSessionChange() {
  for (const listener of sessionListeners) listener();
}

function subscribeToSession(onStoreChange: () => void) {
  sessionListeners.add(onStoreChange);
  window.addEventListener("storage", onStoreChange);
  return () => {
    sessionListeners.delete(onStoreChange);
    window.removeEventListener("storage", onStoreChange);
  };
}

/** Resolves the stored credentials into a user. Pure — never touches storage. */
function resolveSession(
  token: string | null,
  profileJson: string | null,
  isProd: boolean
): User | null {
  if (token) {
    const decodedUser = validateAndDecode(token);
    if (!decodedUser) return null;
    return readStoredProfile(profileJson) ?? decodedUser;
  }

  if (!isProd) return readStoredProfile(profileJson);

  return null;
}

let cachedKey: string | null = null;
let cachedUser: User | null = null;

function getSessionSnapshot(): User | null {
  const token = readStorageItem(TOKEN_STORAGE_KEY);
  const profileJson = readStorageItem(USER_STORAGE_KEY);
  const isProd = process.env.NODE_ENV === "production";

  const key = [token, profileJson, isProd].join("\u0000");
  if (key !== cachedKey) {
    cachedKey = key;
    cachedUser = resolveSession(token, profileJson, isProd);
  }
  return cachedUser;
}

/** The server has no localStorage, so it always renders as signed out. */
function getServerSessionSnapshot(): User | null {
  return null;
}

/** A one-shot store whose only job is to report that the client took over. */
function subscribeToHydration() {
  return () => {};
}

/**
 * Provides authentication state and methods to the application.
 *
 * Supports two modes:
 * - Backend mode (NEXT_PUBLIC_API_URL set): verifies Google token server-side,
 *   stores our own JWT for API access.
 * - Static mode (no API URL): decodes Google JWT client-side for basic profile info.
 *   This preserves functionality on static GitHub Pages deployments.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();

  const user = useSyncExternalStore(
    subscribeToSession,
    getSessionSnapshot,
    getServerSessionSnapshot
  );

  // Until the client has hydrated we genuinely do not know whether there is a
  // session, and consumers must not redirect on that guess.
  const isHydrated = useSyncExternalStore(
    subscribeToHydration,
    () => true,
    () => false
  );

  // A token we refused to trust must not survive the reload that revealed it.
  useEffect(() => {
    const token = readStorageItem(TOKEN_STORAGE_KEY);

    if (token) {
      if (!validateAndDecode(token)) {
        localStorage.removeItem(TOKEN_STORAGE_KEY);
        localStorage.removeItem(USER_STORAGE_KEY);
        emitSessionChange();
      }
      return;
    }

    const profileJson = readStorageItem(USER_STORAGE_KEY);
    const isProd = process.env.NODE_ENV === "production";
    if (!isProd && profileJson && readStoredProfile(profileJson) === null) {
      localStorage.removeItem(USER_STORAGE_KEY);
      emitSessionChange();
    }
  }, []);

  /**
   * Authenticates a user with a Google credential.
   *
   * If a backend API is configured, sends the Google ID token to the backend
   * for server-side verification and receives our own JWT.
   * Otherwise, falls back to client-side JWT decoding.
   */
  const login = useCallback(async (credential: string): Promise<void> => {
    if (isApiAvailable()) {
      const response = await verifyGoogleToken(credential);
      const backendUser: User = {
        id: response.user.id,
        email: response.user.email,
        name: response.user.name,
        picture: response.user.picture,
      };
      localStorage.setItem(TOKEN_STORAGE_KEY, response.access_token);
      localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(backendUser));
      emitSessionChange();
      return;
    }

    const decodedUser = validateAndDecode(credential);
    if (decodedUser) {
      localStorage.setItem(TOKEN_STORAGE_KEY, credential);
      localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(decodedUser));
      emitSessionChange();
    }
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    localStorage.removeItem(USER_STORAGE_KEY);
    emitSessionChange();
    router.push("/");
  }, [router]);

  const value = useMemo(
    () => ({
      user,
      isAuthenticated: !!user,
      isLoading: !isHydrated,
      login,
      logout,
    }),
    [user, isHydrated, login, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/**
 * Hook to use the Auth context.
 */
export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
