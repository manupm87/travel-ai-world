"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import type { User } from "@/types/user";
import { loginWithGoogle } from "@/services/auth";
import {
  completeCognitoLogin,
  isCognitoAvailable,
  logoutFromCognito,
  needsRefresh,
  refreshCognitoSession,
  startCognitoLogin,
} from "@/services/cognito";
import {
  clearSession,
  getServerSnapshot,
  getSnapshot,
  pruneInvalidSession,
  subscribe,
} from "@/services/session";

/**
 * How this build signs people in (ADR 0009):
 * - `cognito`: redirect to the user pool's managed login (deployed).
 * - `google`: Google Identity Services button + core_api's `/auth/google` (local).
 */
export type AuthProvider = "cognito" | "google";

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  /** True until the client has hydrated and storage has been read (and, in
   * Cognito mode, an expired session has been refreshed or dropped). */
  isLoading: boolean;
  provider: AuthProvider;
  /** Google mode: turns a Google credential into a session. */
  login: (credential: string) => Promise<void>;
  /** Cognito mode: leaves the page for the managed login; `redirect` is the
   * same-origin path to come back to. */
  loginWithRedirect: (redirect: string | null) => Promise<void>;
  /** Cognito mode: finishes the login on `/auth/callback/`; resolves with the
   * path to continue to. */
  completeLogin: (params: URLSearchParams) => Promise<string | null>;
  /** Clears the session. Navigating afterwards is the caller's decision
   * (Cognito mode navigates to the pool's logout by itself). */
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
 * that window, and the silent refresh of an expired Cognito session.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const user = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const provider: AuthProvider = isCognitoAvailable() ? "cognito" : "google";

  const isHydrated = useSyncExternalStore(
    subscribeToHydration,
    () => true,
    () => false
  );

  // Decided on the client before the first effect, so a protected page does
  // not see "signed out" while the refresh is still on its way.
  const [restoring, setRestoring] = useState(
    () => typeof window !== "undefined" && needsRefresh()
  );

  useEffect(() => {
    pruneInvalidSession();
    if (!needsRefresh()) return;
    void refreshCognitoSession().finally(() => setRestoring(false));
  }, []);

  const login = useCallback(async (credential: string) => {
    await loginWithGoogle(credential);
  }, []);

  const loginWithRedirect = useCallback(async (redirect: string | null) => {
    await startCognitoLogin(redirect);
  }, []);

  const completeLogin = useCallback(async (params: URLSearchParams) => {
    const { redirect } = await completeCognitoLogin(params);
    return redirect;
  }, []);

  const logout = useCallback(() => {
    if (isCognitoAvailable()) logoutFromCognito();
    else clearSession();
  }, []);

  const value = useMemo(
    () => ({
      user,
      isAuthenticated: user !== null,
      isLoading: !isHydrated || restoring,
      provider,
      login,
      loginWithRedirect,
      completeLogin,
      logout,
    }),
    [user, isHydrated, restoring, provider, login, loginWithRedirect, completeLogin, logout]
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
