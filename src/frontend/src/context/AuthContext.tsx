"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import type { User } from "@/types/user";
import { loginWithGoogle } from "@/services/auth";
import {
  clearSession,
  getServerSnapshot,
  getSnapshot,
  pruneInvalidSession,
  subscribe,
} from "@/services/session";

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  /** True until the client has hydrated and storage has been read. */
  isLoading: boolean;
  login: (credential: string) => Promise<void>;
  /** Clears the session. Navigating afterwards is the caller's decision. */
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

/** A one-shot store whose only job is to report that the client took over. */
function subscribeToHydration() {
  return () => {};
}

/**
 * Exposes the session owned by `services/session.ts` to React.
 *
 * Until the client has hydrated we genuinely do not know whether there is a
 * session, and consumers must not redirect on that guess: `isLoading` covers
 * that window.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const user = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const isHydrated = useSyncExternalStore(
    subscribeToHydration,
    () => true,
    () => false
  );

  useEffect(() => {
    pruneInvalidSession();
  }, []);

  const login = useCallback(async (credential: string) => {
    await loginWithGoogle(credential);
  }, []);

  const logout = useCallback(() => {
    clearSession();
  }, []);

  const value = useMemo(
    () => ({
      user,
      isAuthenticated: user !== null,
      isLoading: !isHydrated,
      login,
      logout,
    }),
    [user, isHydrated, login, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
