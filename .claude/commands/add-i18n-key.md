Add a new i18n translation key to both `en.ts` and `es.ts`.

Steps:
1. Identify the section and key name to add (ask the user if not provided).
2. Update `src/i18n/types.ts` — add the key to the appropriate interface.
3. Update `src/i18n/en.ts` — add the English string.
4. Update `src/i18n/es.ts` — add the Spanish string.
5. Use the key in the component via `const { t } = useLanguage()` and `t.section.key`.

Rules:
- Never hardcode strings in components — always go through `t`.
- The `Translations` interface in `types.ts` is the source of truth; TypeScript will catch any missing keys.
- Keep the key naming consistent with the existing snake_case style within sections.
