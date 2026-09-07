"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo,
  type ReactNode,
} from "react";
import { DEFAULT_LANGUAGE, getLanguageMeta, locales } from "@/i18n";
import type { Language, Translations } from "@/i18n";

interface LanguageContextValue {
  language: Language;
  /** BCP 47 tag for `Intl` formatters (`en-US`, `es-ES`, ...). */
  locale: string;
  t: Translations;
  setLanguage: (lang: Language) => void;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(DEFAULT_LANGUAGE);

  const setLanguage = useCallback((lang: Language) => {
    setLanguageState(lang);
    // Keep the <html lang> attribute in sync for accessibility + SEO
    document.documentElement.lang = lang;
  }, []);

  const value = useMemo<LanguageContextValue>(
    () => ({
      language,
      locale: getLanguageMeta(language).locale,
      t: locales[language],
      setLanguage,
    }),
    [language, setLanguage]
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
