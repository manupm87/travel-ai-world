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
import { DEFAULT_LANGUAGE, getLanguageMeta, locales } from "@/i18n";
import type { Language, Translations } from "@/i18n";
import {
  preferredLanguage,
  subscribeLanguage,
  writeStoredLanguage,
} from "@/services/languagePreference";

interface LanguageContextValue {
  language: Language;
  /** BCP 47 tag for `Intl` formatters (`en-US`, `es-ES`, ...). */
  locale: string;
  t: Translations;
  setLanguage: (lang: Language) => void;
  /**
   * False only while the static HTML hydrates in the default language; right
   * after, the page is in the traveller's own (stored, else the browser's,
   * TRA-246). Whatever speaks for the traveller at once — the planner's first
   * turn — waits for it.
   */
  resolved: boolean;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

const serverLanguage = (): Language => DEFAULT_LANGUAGE;
const noSubscription = () => () => {};

export function LanguageProvider({ children }: { children: ReactNode }) {
  const language = useSyncExternalStore(subscribeLanguage, preferredLanguage, serverLanguage);
  const resolved = useSyncExternalStore(
    noSubscription,
    () => true,
    () => false
  );

  // Keep the <html lang> attribute in sync for accessibility + SEO
  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  const setLanguage = useCallback((lang: Language) => {
    writeStoredLanguage(lang);
  }, []);

  const value = useMemo<LanguageContextValue>(
    () => ({
      language,
      locale: getLanguageMeta(language).locale,
      t: locales[language],
      setLanguage,
      resolved,
    }),
    [language, setLanguage, resolved]
  );

  return (
    <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>
  );
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useLanguage must be used inside <LanguageProvider>");
  return ctx;
}
