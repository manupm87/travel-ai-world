"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import type { User } from "@/types/user";
import { getMyAccess } from "@/services/access";
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
import {
  clearSession,
  getServerSnapshot,
  getSnapshot,
  pruneInvalidSession,
  readToken,
  subscribe,
  updateStoredUser,
} from "@/services/session";
import { getMe } from "@/services/users";

/**
 * How this build signs people in (ADR 0009):
 * - `cognito`: redirect to the user pool's managed login (deployed).
 * - `google`: Google Identity Services button + core_api's `/auth/google` (local).
 */
export type AuthProvider = "cognito" | "google";

/**
 * Whether the account is on the access list (TRA-257, ADR 0026), as core_api
 * answered on `GET /users/me/access`. `unknown` until it answers, and for
 * good when it cannot (no API, offline, a 5xx): it then behaves as allowed,
 * because the backend refuses an uninvited account anyway.
 */
export type AccessState = "unknown" | "allowed" | "denied";

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  /** `user.role === "admin"`: the role core_api reported for this account (TRA-222). */
  isAdmin: boolean;
  /** `denied`: signed in, but not invited yet. Never stored with the session. */
  access: AccessState;
  /** Asks core_api again whether the account is on the list (someone who was
   * just invited need not sign out and in). A failed read keeps the answer. */
  refreshAccess: () => Promise<void>;
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

  // The role is the account's, not the token's: ask core_api once per signed-in
  // account (on restore, and right after a login) and merge it into the stored
  // profile. A failure is silent — the role stays whatever was stored.
  // The same moment asks whether the account is on the access list; the answer
  // lives in memory only, tied to the account it was given for.
  const roleCheckedFor = useRef<string | null>(null);
  const [accessAnswer, setAccessAnswer] = useState<{ userId: string; access: AccessState } | null>(null);
  const isLoading = !isHydrated || restoring;
  const userId = user?.id ?? null;
  // Signed out: the answer goes with the session, so the next sign-in (even of
  // the same account, perhaps invited meanwhile) starts from "unknown".
  if (userId === null && accessAnswer !== null) setAccessAnswer(null);
  useEffect(() => {
    if (isLoading || userId === null) {
      if (userId === null) roleCheckedFor.current = null;
      return;
    }
    if (roleCheckedFor.current === userId) return;
    if (!readToken() || !isApiAvailable()) return;
    roleCheckedFor.current = userId;
    getMe()
      .then((me) => {
        if (me) updateStoredUser({ role: me.role });
      })
      .catch(() => {});
    getMyAccess()
      .then((answer) => {
        if (answer) setAccessAnswer({ userId, access: answer.allowed ? "allowed" : "denied" });
      })
      .catch(() => {});
  }, [isLoading, userId]);

  const access: AccessState =
    accessAnswer !== null && accessAnswer.userId === userId ? accessAnswer.access : "unknown";

  const refreshAccess = useCallback(async () => {
    if (userId === null || !readToken() || !isApiAvailable()) return;
    const answer = await getMyAccess().catch(() => null);
    if (answer) setAccessAnswer({ userId, access: answer.allowed ? "allowed" : "denied" });
  }, [userId]);

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
      isAdmin: user?.role === "admin",
      access,
      refreshAccess,
      isLoading,
      provider,
      login,
      loginWithRedirect,
      completeLogin,
      logout,
    }),
    [user, access, refreshAccess, isLoading, provider, login, loginWithRedirect, completeLogin, logout]
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
