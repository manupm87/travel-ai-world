Add a new page section component to the landing page.

Steps:
1. Create the component file in `src/components/sections/<SectionName>.tsx`.
2. Mark it `"use client"` only if it needs React state or browser APIs.
3. Use `const { t } = useLanguage()` for all visible text — no hardcoded strings.
4. Add any new translation keys to `types.ts`, `en.ts`, and `es.ts`.
5. Style with Tailwind v4 classes and the existing CSS custom property tokens from `globals.css`.
6. Import and render the component in `src/app/page.tsx`.

Design token reminder (in `globals.css`):
- Background: `--color-bg-primary`, `--color-bg-secondary`, `--color-bg-card`
- Accent: `--color-accent` (`#4F6EF7`)
- Muted text: `--color-text-secondary`
