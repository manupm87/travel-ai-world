# AGENTS.md — frontend

Read the root [`AGENTS.md`](../../AGENTS.md) first. Next.js 16 App Router, static export, React 19,
TypeScript 5, Tailwind CSS v4.

## Rules

- **i18n**: every visible string (including `alt`/`aria-label`) via `const { t } = useLanguage()`; keys in
  `src/i18n/{types,en,es}.ts`. Placeholders via `interpolate(t.x, { name })`. Dates and money via
  `useFormatters()` (`src/hooks/useFormatters.ts`), never `language === "en" ? "en-US" : ...`.
  Language metadata (flag, native name, locale) lives only in `LANGUAGES` (`src/i18n/index.ts`).
- **Network only in `src/services/`**: `http.ts` (base URLs, auth header, error parsing),
  `session.ts` (the only owner of the `localStorage` session), `auth.ts` (core_api),
  `chat.ts` (ai_api), `trips.ts` (fixtures today; owns `toTrip`, the only place that turns a
  `TripResponse` into the `Trip` view model — ADR 0006). Components never `fetch` or touch the session storage.
- **`src/types/trip.ts` is a view model**, not a response shape: components render it, `services/trips.ts`
  builds it from the generated `TripResponse`. Fixtures in `src/mocks/*.ts` are `TripResponse` objects
  checked with `satisfies`; add derived facts (e.g. `ItineraryDay.kind`) in the mapper, not in JSX.
- **Types from the backend are generated**: `src/types/generated/{core-api,ai-api}.ts` via
  `npm run types:generate` (from `docs/api/*.openapi.json`). Do not edit them; do not redeclare
  response shapes by hand — import `components["schemas"]["..."]`.
- **Two base URLs**: `NEXT_PUBLIC_API_URL` (core) and optional `NEXT_PUBLIC_AI_API_URL` (defaults to
  core, for single-origin deployments). Static builds set neither; features degrade gracefully via
  `isApiAvailable()` / `isAiAvailable()`.
- Styling: CSS custom properties from `src/app/globals.css` (`--color-bg-primary`, `--color-accent`,
  `--color-error/success/warning`, `--header-h`, `--shadow-accent-glow`, ...); no `tailwind.config.js`.
  Use the tokens (`text-error`, `pt-(--header-h)`, `shadow-accent-glow`), not palette literals like
  `text-red-400` or `rgba(79,110,247,…)`. Compose classes with `cn()` (`src/utils/cn.ts`) so a
  consumer's `p-8` reliably overrides a primitive's `p-6`.
- **Lint enforces the boundaries** (`eslint.config.mjs`): no `fetch` outside `src/services/`, no
  `@/mocks/*` outside `src/services/`, no `@/types/generated/*` outside `src/services/` and
  `src/types/`, imports first, `console` is a warning. `tsconfig` has `noUncheckedIndexedAccess`:
  key lookups on i18n ids (`step.id`, `feat.id`, `TripStatus`) instead of indexing parallel arrays.
- Files: components `PascalCase.tsx`, utilities and hooks `camelCase.ts`, locales `<code>.ts`.
- Routes live in groups: `app/(marketing)/` (public; layout = Header + Footer) and `app/(app)/`
  (signed-in; layout = shell + `ProtectedRoute`). Do not wrap pages in `ProtectedRoute` again.
- `/trip/[id]` (`app/(app)/trip/[id]/`) is split in `page.tsx` (server, `generateStaticParams`) +
  `TripClientPage.tsx` (client).
- Tests: `renderWithProviders` from `src/test/render.tsx` and the typed builders in
  `src/test/fixtures.ts`; assert on roles/names/`data-*` state and on `en.ts` copy, not on class names.
  Do not mock `Card`/`Section`/`Container`/`next/link` or `lucide-react` icon by icon.

## Commands

```bash
npm run dev · npm run lint · npm run test:unit · npm run test:e2e · npm run build
npm run types:generate   # after any backend schema change (or `just contracts` from the root)
npm run types:check      # what CI runs
```

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
