"use client";

import {
  createContext,
  useContext,
  useEffect,
  useCallback,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { createLocalStorageStore } from "@/utils/localStorageStore";

/** What the page paints with. */
type Theme = "light" | "dark";
/** What the traveller chose: a theme, or whatever the system says (TRA-235). */
export type ThemePreference = Theme | "system";

interface ThemeContextValue {
  /** The theme in use: the choice, or the system's when the choice is "system". */
  theme: Theme;
  /** The choice itself, as the menu shows it. */
  preference: ThemePreference;
  toggleTheme: () => void;
  setTheme: (theme: ThemePreference) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

const DEFAULT_THEME: Theme = "dark";
const themeStore = createLocalStorageStore("theme");
const DARK_QUERY = "(prefers-color-scheme: dark)";

// Returns a primitive, so it is stable across calls without any memoisation.
function getPreferenceSnapshot(): ThemePreference {
  const saved = themeStore.read();
  return saved === "light" || saved === "dark" || saved === "system" ? saved : DEFAULT_THEME;
}

/** The server has no localStorage, so it always renders the default theme. */
function getServerPreferenceSnapshot(): ThemePreference {
  return DEFAULT_THEME;
}

function subscribeSystem(listener: () => void): () => void {
  const query = window.matchMedia?.(DARK_QUERY);
  if (!query) return () => {};
  query.addEventListener("change", listener);
  return () => query.removeEventListener("change", listener);
}

/** Without `matchMedia` (jsdom, very old browsers) the system reads as dark. */
function getSystemSnapshot(): Theme {
  const query = window.matchMedia?.(DARK_QUERY);
  if (!query) return DEFAULT_THEME;
  return query.matches ? "dark" : "light";
}

function getServerSystemSnapshot(): Theme {
  return DEFAULT_THEME;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const preference = useSyncExternalStore(
    themeStore.subscribe,
    getPreferenceSnapshot,
    getServerPreferenceSnapshot
  );
  const system = useSyncExternalStore(subscribeSystem, getSystemSnapshot, getServerSystemSnapshot);
  const theme: Theme = preference === "system" ? system : preference;

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  const setTheme = useCallback((newTheme: ThemePreference) => {
    themeStore.write(newTheme);
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme(theme === "dark" ? "light" : "dark");
  }, [theme, setTheme]);

  const value = useMemo(
    () => ({ theme, preference, toggleTheme, setTheme }),
    [theme, preference, toggleTheme, setTheme]
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used inside <ThemeProvider>");
  return ctx;
}
