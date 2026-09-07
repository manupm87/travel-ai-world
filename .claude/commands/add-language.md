Add a new supported language to the app.

Steps:

All paths are under `src/frontend/`.

1. Create `src/i18n/<code>.ts` — copy `en.ts` as a template and translate all strings. TypeScript will error at import time if any key is missing.
2. In `src/i18n/types.ts` — add the new code to the `Language` union type: `export type Language = "en" | "es" | "<code>";`
3. In `src/i18n/index.ts` — import the new locale, add it to the `locales` map, and add an entry to `LANGUAGES`: `{ code: "<code>", flag: "<emoji>", nativeName: "<name in that language>", locale: "<BCP 47 tag, e.g. fr-FR>" }`.
4. Run `npm run test:unit -- src/i18n` — `i18n.test.ts` checks the key structure matches `en.ts` and that `LANGUAGES` covers the union.

That's all — the header switcher, `useFormatters()` and `<html lang>` read from `LANGUAGES`; no component changes.
