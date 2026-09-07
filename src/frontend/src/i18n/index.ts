// ─── i18n barrel ────────────────────────────────────────────────────────────
// To add a new language:
//   1. Create src/i18n/fr.ts  (copy en.ts, translate)
//   2. Add "fr" to the Language union in types.ts
//   3. Add `fr` to the `locales` map and an entry to `LANGUAGES` below
// The compiler flags a missing locale or LANGUAGES entry; the rest of the app
// (header switcher, formatters, <html lang>) picks the language up from here.

import en from "./en";
import es from "./es";
import type { Language, Translations } from "./types";

export type {
  Language,
  Translations,
  Step,
  StepId,
  FeatureItem,
  FeatureId,
  Stat,
  Testimonial,
  FooterLinkGroup,
} from "./types";
export { interpolate } from "./interpolate";

export const locales: Record<Language, Translations> = { en, es };

export interface LanguageMeta {
  code: Language;
  /** Emoji shown in the switcher. */
  flag: string;
  /** The language's own name for itself, never translated. */
  nativeName: string;
  /** BCP 47 tag handed to `Intl` formatters. */
  locale: string;
}

/** Every supported language, in the order the switcher lists them. */
export const LANGUAGES = [
  { code: "en", flag: "🇬🇧", nativeName: "English", locale: "en-US" },
  { code: "es", flag: "🇪🇸", nativeName: "Español", locale: "es-ES" },
] as const satisfies readonly LanguageMeta[];

// Compile-time guard: every member of the Language union has metadata.
type ListedLanguage = (typeof LANGUAGES)[number]["code"];
type MissingLanguage = Exclude<Language, ListedLanguage>;
const allLanguagesListed: [MissingLanguage] extends [never] ? true : never = true;
void allLanguagesListed;

export const DEFAULT_LANGUAGE: Language = "en";

export function getLanguageMeta(code: Language): LanguageMeta {
  // The guard above makes the lookup total; the fallback only satisfies TS.
  return LANGUAGES.find((l) => l.code === code) ?? LANGUAGES[0];
}
