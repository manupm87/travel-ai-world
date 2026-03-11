Add a new supported language to the app.

Steps:
1. Create `src/i18n/<code>.ts` — copy `en.ts` as a template and translate all strings. TypeScript will error at import time if any key is missing.
2. In `src/i18n/types.ts` — add the new code to the `Language` union type: `export type Language = "en" | "es" | "<code>";`
3. In `src/i18n/index.ts` — import the new locale and add it to the `locales` map.
4. In `src/components/layout/Header.tsx` — add the flag emoji and language code to the `FLAG` map.

That's all — no other files need to change.
