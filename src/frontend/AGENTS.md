# AGENTS.md — frontend

Read the root [`AGENTS.md`](../../AGENTS.md) first. Next.js 16 App Router as a **static export**,
React 19, TypeScript 5 (strict), Tailwind CSS v4. Humans: [`README.md`](README.md).

This file holds the rules. What a file does is in its header comment (change it with the code),
the decisions are in the ADRs linked below, and nothing here narrates history.

## Rules

- **i18n.** Every visible string, `alt` and `aria-label` comes from `const { t } = useLanguage()`;
  keys live in `src/i18n/{types,en,es}.ts`, placeholders go through `interpolate(t.x, { name })`.
  Dates, money and numbers go through `useFormatters()`, never `language === "en" ? "en-US" : …`;
  language metadata lives only in `LANGUAGES` (`src/i18n/index.ts`). `plan.alternatives.askMessage*`
  is parsed by ai_api: read its comment in `types.ts` before changing or translating it.
- **Network only in `src/services/`** ([its README](src/services/README.md)). Components and
  hooks never call `fetch`, nor touch the stored session, planner draft or language: `session.ts`,
  `plannerDraft.ts` and `languagePreference.ts` own those keys. The one network exception is
  MapLibre fetching its own tiles from OpenFreeMap
  ([ADR 0016](../../docs/architecture/adr/0016-planner-map-openfreemap-maplibre.md)); it gives no
  component the right to `fetch`.
- **Backend types are generated** into `src/types/generated/` (`npm run types:generate`, or
  `just contracts` from the root after a schema change). Never edit them, never redeclare a
  response shape: import `components["schemas"]["…"]`. The planner's SSE contract is generated
  too; `src/types/planner.ts` only re-exports it and adds helpers.
- **`src/types/trip.ts` is a view model**, built from `TripResponse` by `services/trips.ts::toTrip`
  ([ADR 0006](../../docs/architecture/adr/0006-frontend-trip-view-model.md)): a derived fact goes
  in the mapper, not in JSX.
- **Hooks own async state, components render it.** A hook exposes a `status` union, aborts its
  request on unmount and when a newer one starts, clears the session on a 401 (the route guard
  then sends the visitor home) and hands the UI an `ApiError` whose `code` picks translated copy,
  never the server's text. Logic that can be pure stays out of React (`hooks/plannerReducer.ts`,
  `components/planner/v2/mapStops.ts`, `components/admin/**/*.ts`) and is tested there.
- **Lint and the compiler hold the boundaries** ([`eslint.config.mjs`](eslint.config.mjs)): no
  `fetch` outside `src/services/`, `@/types/generated/*` only from `src/services/` and
  `src/types/`, imports first, `console` warns. `noUncheckedIndexedAccess` is on: look values up
  by key (`Record<TripPhase, …>`) instead of indexing parallel arrays.
- **Files**: components `PascalCase.tsx`, hooks and utilities `camelCase.ts`, locales `<code>.ts`,
  tests `*.test.ts(x)` beside the file they test.

## Boundaries

### Static export

`next.config.ts` sets `output: "export"` and `trailingSlash: true`: the build is plain files behind
CloudFront ([README](README.md#static-export-config-nextconfigts)).

- Nothing may need a server at request time: no server actions, `proxy`, cookies, rewrites or
  redirects, route handlers that read the request, or per-request data fetching (Next's list:
  `node_modules/next/dist/docs/01-app/02-guides/static-exports.md`).
- A page with per-user data is a static shell (`page.tsx`) over a client component that loads the
  data with a hook ([ADR 0011](../../docs/architecture/adr/0011-real-trips-seed-and-client-side-loading.md)).
- Ids travel in the query, never as `[id]` segments: `/plan/?trip=${encodeURIComponent(id)}`,
  `/admin/turn/?id=`. `/trip/?id=` only forwards old links to the planner.
- `useSearchParams` needs a `Suspense` boundary above it. A page that must stay prerendered (the
  landing) reads `window.location` through `useSyncExternalStore` instead (`AskField.tsx`).
- `public/maplibre/` is copied from `node_modules` before `dev`, `build` and the e2e runs
  (`scripts/copy-maplibre-worker.mjs`) and is gitignored: never commit it.

### Backend and sign-in

- **Two base URLs** ([ADR 0003](../../docs/architecture/adr/0003-frontend-two-base-urls.md)):
  `NEXT_PUBLIC_API_URL` (core_api) and `NEXT_PUBLIC_AI_API_URL` (ai_api, defaults to the first).
  Without them features degrade through `isApiAvailable()` / `isAiAvailable()`; the planner plays
  the recorded Budapest session (`src/data/planner-demo/`) under a demo banner when there is no AI
  URL or `/planner` answers 404/405.
- **Sign-in** ([README](README.md#authentication)): `AuthContext.provider` is `cognito` when
  `NEXT_PUBLIC_COGNITO_DOMAIN` and `NEXT_PUBLIC_COGNITO_CLIENT_ID` are set (deployed: managed login
  with code + PKCE, back through `/auth/callback/`), `google` otherwise (local: core_api's
  `POST /auth/google`). `isAdmin` comes from `GET /users/me`, `access` from `GET /users/me/access`
  ([ADR 0026](../../docs/architecture/adr/0026-access-list-and-daily-token-quota.md)).
- **Route groups declare the chrome and the guard once**: `(marketing)` public, `(app)` signed in
  (`ProtectedRoute`), `(admin)` the console (`ProtectedRoute` + `AdminGate`,
  [ADR 0024](../../docs/architecture/adr/0024-turn-traces-and-admin-access.md)). Never wrap a page
  in `ProtectedRoute` again. These gates are courtesy: the services refuse with 401/403 anyway.

### Product rules that span files

- **Trips** ([ADR 0019](../../docs/architecture/adr/0019-trips-live-in-the-planner.md),
  [0020](../../docs/architecture/adr/0020-signed-in-home-is-the-trips-page.md)): one trip is one
  city, and core_api derives its phase from the dates. Only an `upcoming` trip changes: on
  `ongoing` and `past` the planner renders no composer, Save, "Start over", "Change" or "Remove"
  (absent, not disabled), because core_api answers 409 `TRIP_LOCKED`. Delete works in every phase.
  Trips are listed only on `/dashboard/`; the planner holds the one trip it opened.
- **Planner** ([ADR 0015](../../docs/architecture/adr/0015-planner-sse-v2-stateless-orchestration.md),
  [0025](../../docs/architecture/adr/0025-planner-progress-event.md)): ai_api is stateless, so
  every turn sends the brief, the itinerary snapshot, `session_id` and the page's language. A price
  is a tier (`€`/`€€`/`€€€`), never a number. Assistant text renders through
  `components/planner/MarkdownContent.tsx`; raw HTML is never rendered (no `rehype-raw`).
- **Admin console**: it only reads, except the access list (`/admin/access/`). Nothing on
  `/admin/trip/` writes, and nothing may be added that does.

### Design

- Read [`docs/design/kyrian-world.md`](../../docs/design/kyrian-world.md) before designing a
  surface: palette, type, motion, copy, dialogs and the floor every surface meets.
- Tokens come from `src/app/globals.css` (there is no `tailwind.config.js`): `bg-action
  text-on-action` for the primary action (never `bg-accent text-white`), `text-error`,
  `pt-(--header-h)`, `shadow-accent-glow`. No palette literals (`text-red-400`) or raw hex. Compose
  classes with `cn()` (`src/utils/cn.ts`) so a consumer's class beats a primitive's default.
- Every modal uses `hooks/useDialog.ts`; never write another focus trap.

## Source map

```text
src/app/               routes: static shells + client pages; globals.css (tokens), layout.tsx
  (marketing)/         public: the landing `/`, auth/callback/
  (app)/               signed in: dashboard/ (the home), plan/ (the planner), trip/ (old links)
  (admin)/admin/       the console: overview, turns/, turn/, trips/, trip/, users/, access/, quality/
src/components/        by feature: ui/ (primitives), layout/, landing/, common/ (AskComposer), auth/,
                       trips/, kiri/, planner/ (v2/ is the planner page), admin/
src/hooks/             async state and page logic (usePlanner + plannerReducer, useTrips…); admin/
src/context/           AuthContext, LanguageContext, ThemeContext
src/services/          every network call; the session, draft and language keys (README)
src/i18n/              types.ts (the contract), en.ts, es.ts, index.ts (LANGUAGES), interpolate.ts
src/types/             view models (trip, trip-summary, user), planner.ts, generated/ (never edit)
src/utils/             pure helpers: cn, format, tripDates, safeRedirect, suitcase…
src/data/planner-demo/ the recorded Budapest session: demo backend and planner test double
src/test/              render.tsx, fixtures.ts, fixtures/ (shared with e2e/)
e2e/                   Playwright specs, three configs
scripts/               copy-maplibre-worker.mjs
```

Entry points: `app/(app)/plan/PlannerClientPage.tsx` wires `hooks/usePlanner.ts` (stream, per-tab
draft) and the pure `hooks/plannerReducer.ts` to `components/planner/v2/`; a draft becomes a trip
in `services/trips.ts::saveDraftAsTrip` and comes back through `services/tripDraft.ts::tripToDraft`.

## Tests

- **Unit**: Vitest and Testing Library (`npm run test:unit`, `just test-frontend`). Render with
  `renderWithProviders` (`src/test/render.tsx`: the real language and theme providers); build data
  with the typed builders in `src/test/fixtures.ts` and the shared fixtures in `src/test/fixtures/`
  (checked with `satisfies`). Assert on roles, accessible names, `data-*` state and the `en.ts`
  copy, never on class names. Do not mock `Card`, `Section`, `Container`, `next/link`, nor
  `lucide-react` icon by icon.
- **E2E**: Playwright, three configs over `e2e/`: `just test-e2e` (`next dev` on :3000),
  `just test-e2e-static` (`next build` on :3100, CI's `frontend` job) and `just test-e2e-stack`
  (the Compose stack on :8080, CI's `e2e-stack` job). What each runs and how to sign in:
  [local-dev runbook](../../docs/runbooks/local-dev.md#end-to-end-tests).
- **A new spec needs no backend unless it must.** Mock the API with `page.route` from the shared
  fixtures (`/ai/planner` with the recorded session); sign in by writing the token and the profile
  into `localStorage` with `page.addInitScript`, under the keys `services/session.ts` exports (a
  fake unsigned JWT will do); call no third party (abort `**/tiles.openfreemap.org/**`). A spec that
  needs a real backend uses `E2E_TOKEN` (`just dev-token <email>`), skips itself without it, and
  creates and deletes its own data through the API.

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
