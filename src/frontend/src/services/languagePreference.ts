/**
 * The traveller's language, kept in `localStorage` so a reload, the sign-in
 * round trip or a shared link opens the site in the language they chose
 * (TRA-246). Before any choice, the browser's own languages decide; anything
 * the site does not ship falls back to the default. The one module that
 * touches this key; `LanguageContext` reads it with `useSyncExternalStore`
 * through `subscribeLanguage` / `preferredLanguage`, so the static HTML
 * hydrates in the default and the page switches right after.
 */

import { DEFAULT_LANGUAGE, LANGUAGES, type Language } from "@/i18n";

export const LANGUAGE_KEY = "travel_ai_language";

/** This page's choice, for when the storage refuses to keep it. */
let chosen: Language | null = null;
const listeners = new Set<() => void>();

function isLanguage(value: unknown): value is Language {
  return LANGUAGES.some((l) => l.code === value);
}

function storage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null; // privacy mode or disabled storage
  }
}

/** The language the traveller chose last, or `null` before any choice. */
export function readStoredLanguage(): Language | null {
  try {
    const stored = storage()?.getItem(LANGUAGE_KEY);
    if (isLanguage(stored)) return stored;
  } catch {
    // Unreadable storage: this page's own choice, if any.
  }
  return chosen;
}

/** Keeps the traveller's choice and tells every subscriber. */
export function writeStoredLanguage(language: Language): void {
  const kept = storage();
  try {
    kept?.setItem(LANGUAGE_KEY, language);
    chosen = kept ? null : language;
  } catch {
    // Quota or disabled storage: the choice lasts for this page only.
    chosen = language;
  }
  listeners.forEach((listener) => listener());
}

/** Told when the choice changes, here or in another tab. */
export function subscribeLanguage(listener: () => void): () => void {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key === LANGUAGE_KEY) listener();
  };
  if (typeof window !== "undefined") window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    if (typeof window !== "undefined") window.removeEventListener("storage", onStorage);
  };
}

/** The first of the browser's languages the site ships (`es-ES` → `es`). */
export function browserLanguage(): Language | null {
  if (typeof navigator === "undefined") return null;
  const asked = navigator.languages?.length ? navigator.languages : [navigator.language];
  for (const tag of asked) {
    const code = tag?.split("-")[0]?.toLowerCase();
    if (isLanguage(code)) return code;
  }
  return null;
}

/** What the site opens in: the stored choice, else the browser's, else the default. */
export function preferredLanguage(): Language {
  return readStoredLanguage() ?? browserLanguage() ?? DEFAULT_LANGUAGE;
}
