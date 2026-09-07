Add a new i18n translation key to both `en.ts` and `es.ts`.

All paths are under `src/frontend/`.

Steps:

1. Identify the section and key name to add (ask the user if not provided).
2. Update `src/i18n/types.ts` — add the key to the appropriate interface. Prefer arrays or
   `Record<Union, string>` over numbered keys (`trust1`, `trust2`) or `switch` statements in components.
3. Update `src/i18n/en.ts` — add the English string.
4. Update `src/i18n/es.ts` — add the Spanish string.
5. Use the key in the component via `const { t } = useLanguage()` and `t.section.key`.
   Placeholders: write `"Your {duration}-Day Journey"` and render with `interpolate(t.section.key, { duration })`.
6. Run `npm run test:unit -- src/i18n` — `i18n.test.ts` fails if a locale is missing the key.

Rules:

- Never hardcode strings in components — this includes `alt`, `aria-label`, `title` and fallback text.
- No `t.x || "fallback"` or `t.x?.y`: every key is typed as required, so the fallback is dead code.
- Dates and money are formatted with `useFormatters()`, not with a locale string in the component.
- The `Translations` interface in `types.ts` is the source of truth; TypeScript will catch any missing keys.
- Keep the key naming consistent with the existing camelCase style within sections.
