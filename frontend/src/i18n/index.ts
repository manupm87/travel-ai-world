// ─── i18n barrel ────────────────────────────────────────────────────────────
// To add a new language:
//   1. Create src/i18n/fr.ts  (copy en.ts, translate)
//   2. Add "fr" to the Language union in types.ts
//   3. Add `fr` to the locales map below
// That's it — the rest of the app picks it up automatically.

export type { Language, Translations } from "./types";
export type { StyleOption, Step, FeatureItem, Stat, Testimonial } from "./types";

import en from "./en";
import es from "./es";
import type { Language, Translations } from "./types";

export const locales: Record<Language, Translations> = { en, es };
