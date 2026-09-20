# AGENTS.md — frontend

Read the root [`AGENTS.md`](../../AGENTS.md) first. Next.js 16 App Router, static export, React 19,
TypeScript 5, Tailwind CSS v4.

## Rules

- **i18n**: every visible string (including `alt`/`aria-label`) via `const { t } = useLanguage()`; keys in
  `src/i18n/{types,en,es}.ts`. Placeholders via `interpolate(t.x, { name })`. Dates and money via
  `useFormatters()` (`src/hooks/useFormatters.ts`), never `language === "en" ? "en-US" : ...`.
  Language metadata (flag, native name, locale) lives only in `LANGUAGES` (`src/i18n/index.ts`).
- **Network only in `src/services/`**: `http.ts` (base URLs, auth header, error parsing, silent
  token refresh before authenticated calls), `session.ts` (the only owner of the `localStorage`
  session: token, profile, refresh token), `cognito.ts` (the deployed sign-in: managed login with
  code + PKCE, `/auth/callback/`, refresh, logout — no SDK), `auth.ts` (the local Google flow
  through core_api), `chat.ts` (ai_api), `trips.ts` (`listTrips` reads the dashboard's trips from
  `GET /api/v1/trips/`; `getTrip` reads the viewer's trip from `GET /api/v1/trips/{id}` and
  resolves `null` on 404 and on 403, so someone else's id looks exactly like a missing one; owns
  `toTrip`, the only place that turns a `TripResponse` into the `Trip` view model — ADR 0006).
  Components never `fetch` or touch the session storage.
  `AuthContext.provider` (`"cognito" | "google"`) says which sign-in the build has; it is decided by
  `NEXT_PUBLIC_COGNITO_DOMAIN` + `NEXT_PUBLIC_COGNITO_CLIENT_ID`.
  The one sanctioned exception is the planner map's tiles: `maplibre-gl` fetches
  `tiles.openfreemap.org` itself (ADR 0016). That is the library's own traffic, not app code —
  no component gains the right to call `fetch`.
- **Hooks own async state, components render it**: `src/hooks/useTrips.ts` loads the dashboard's
  trips (`status: "loading" | "ready" | "error"`, `reload()`, aborts on unmount, clears the session
  on a 401 so the route guard redirects); `useTrip.ts` loads one trip for the viewer the same way,
  with `"not-found"` as a fourth status (a missing or malformed id is not-found without a request;
  `getTrip`'s `null` is not-found too); `useChatStream.ts` does the same for the landing's
  `PlannerCard`; `usePlanner.ts` drives the planner page over the pure reducer in
  `plannerReducer.ts` (every transition, including `applyItineraryOps`, is unit-tested without React;
  the hook owns the stream, aborts it on a new turn, and keeps the per-tab draft through
  `services/plannerDraft.ts`). A page
  that needs per-user data is a static shell (`page.tsx`) plus a client component using the hook,
  never a server-side fetch: the export is static.
- **`src/types/trip.ts` is a view model**, not a response shape: components render it, `services/trips.ts`
  builds it from the generated `TripResponse`. There are no fixtures in the app: the only
  `TripResponse` object in the repo is the test fixture `src/test/fixtures/trip-japan.ts` (checked
  with `satisfies`); add derived facts (e.g. `ItineraryDay.kind`) in the mapper, not in JSX.
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
  `@/types/generated/*` outside `src/services/` and `src/types/`, imports first, `console` is a
  warning. `tsconfig` has `noUncheckedIndexedAccess`:
  key lookups on i18n ids (`step.id`, `feat.id`, `TripStatus`) instead of indexing parallel arrays.
- Files: components `PascalCase.tsx`, utilities and hooks `camelCase.ts`, locales `<code>.ts`.
- Routes live in groups: `app/(marketing)/` (public; layout = Header + Footer, includes
  `auth/callback/`, where Cognito sends the browser back) and `app/(app)/` (signed-in; layout =
  shell + `ProtectedRoute`). Do not wrap pages in `ProtectedRoute` again.
- The trip viewer is `/trip/?id=<uuid>` (`app/(app)/trip/`), one static shell for every trip:
  `page.tsx` (server; wraps the client page in `Suspense`, which `useSearchParams` needs on a static
  export or the build fails) + `TripClientPage.tsx` (client; reads `?id=`, drives `useTrip`, renders
  loading / not-found / error / the viewer sections). Never a `/trip/[id]` route: the export cannot
  serve per-user ids (ADR 0011). Links to a trip are `/trip/?id=${encodeURIComponent(id)}`.
- The planner is `/plan/` (`app/(app)/plan/`, optionally `?q=<prompt>` from the landing's
  `PlannerCard`), the same static-shell + client-page pattern: `PlannerClientPage.tsx` wires
  `usePlanner` to `components/planner/v2/` (layout A from the TRA-136 mockups: `PlannerLayout`
  with three desktop columns — chat ≈ 30 %, trip panel ≈ 40 %, map ≈ 30 % — and the same three as
  mobile tabs, `ChatColumn` with `QuickReplies`, `OptionCarousel` and `OptionCard`, `TripPanel`
  with `BriefChecklist`, `RouteStrip`, `StayCard`, `DayStrip`, `DayCard`, `WarningBadge` and the
  `AlternativesSheet` behind every "Change", `ActivityDetail` over the day, `TripMap` in the
  third column). The
  itinerary is browsed **one day at a time** (TRA-176): `DayStrip` is a horizontal tablist of day
  chips (date, forecast, how many experiences; arrows, Home/End, the selected chip kept in sight by
  scrolling the strip itself — never `scrollIntoView`, which would drag the panel's own scroller) over
  a single `DayCard` rendered `static` — no toggle, always open — and `TripMap`
  maps that same day. The selected day is state of
  `PlannerClientPage` (`hooks/useSelectedDay.ts`), because the `panel` and the `map` slot of
  `PlannerLayout` both follow it; it falls back to the first day whenever the day it points at is
  not in the itinerary — which is what makes a new trip open on day 1 — and is not persisted. Day dates come from `components/planner/v2/tripDates.ts`.
  The **map** (TRA-147, ADR 0016) is MapLibre GL over OpenFreeMap's keyless tiles: `mapStops.ts`
  is pure (`toMapStops(itinerary, selectedDay)` → the stay as an unnumbered "H" pin then the day's
  located cards numbered in slot order, plus `boundsOf`/`lineOf`), `TripMap.tsx` is the region and
  the empty state and pulls `TripMapCanvas.tsx` in through `next/dynamic` with `ssr: false`
  (MapLibre needs `window`, and this keeps it out of every other route's bundle), and the canvas
  owns the instance: HTML markers, a straight `LineString` through the day (no routing — travel
  times stay in `RouteStrip`), `fitBounds` per day and `setStyle` per theme. The canvas also tells
  MapLibre where its worker is (`setWorkerUrl` → `/maplibre/maplibre-gl-worker.js`, TRA-181):
  `scripts/copy-maplibre-worker.mjs` copies the worker and `maplibre-gl-shared` from
  `node_modules` into the gitignored `public/maplibre/` before `next dev`/`next build`
  (`predev`, `prebuild`, `pretest:e2e*`), as `.js` with the worker's relative import rewritten
  (a module worker needs a JavaScript MIME type and nginx does not give `.mjs` one), because a
  bundled `import.meta.url` does not point at the file and a map without its worker is pins over a
  blank canvas. Never commit that folder. `PlannerClientPage`
  calls `toMapStops` once and gives the list to both columns, so a card's badge in the panel and
  its pin on the map always carry the same number; `selectedStopId` lives there too and is cleared
  when the day changes.
  **Opening an activity** (TRA-179) is that same selection: every stop of the day and the stay is a
  button (`aria-pressed`, `data-stop-index`; "Change"/"Remove" are separate buttons beside it, never
  a click on the row), and it sets `selectedStopId` — the very id a marker click sets, `stopId`/
  `stayStopId` from `mapStops.ts` for *every* card, with or without coordinates. While one is
  selected, `TripPanel` renders `ActivityDetail` **in place of** the day's `DayCard` (the `DayStrip`
  above it stays, so switching day closes the detail with it), and the map grows that marker,
  dims the others and `easeTo`s it at zoom ≥ 15 — while it is open the viewport is its own (an
  itinerary rewritten under it, a chat turn touching the same day, never re-fits the day behind
  it), and closing it fits the day again. The swap is a view change, not a navigation, so the
  keyboard follows it: `ActivityDetail` focuses its back button on mount and `TripPanel` gives
  focus back to the row the activity was opened from; Escape closes the activity **unless**
  something modal is open over it (`[role="dialog"][aria-modal="true"]` — both listen on
  `document`, where `stopPropagation` cannot separate them); and the day's `tabpanel` is renamed
  after the stay while the stay's page is what it holds, because the stay belongs to no day. The detail shows
  the card (hero photo with its credit, chips, the model's `why`) and, over it, the full article
  from `GET /ai/planner/card?id=` (TRA-178): `services/planner.ts::getCardDetail` answers `null`
  — never an error — without an ai_api URL, on a missing route or on 404, and `hooks/useCardDetail.ts`
  owns the request (`idle | loading | ready | unavailable | error`, aborted on id change, one
  module-level cache per tab). Merge it with `mergeCardDetail` (the card keeps its `why` and its
  photo); `unavailable` shows the card alone and says nothing, which is what demo mode always does.
  The wire contract
  (SSE v2, TRA-142) is mirrored by hand in `src/types/planner.ts` until `ai_api` exports it through
  `just contracts`; when it does, replace the declarations by re-exports of the generated types and
  keep the helpers. A price is only ever a tier (`€`/`€€`/`€€€`), never a number. The recorded
  Budapest session lives in `src/data/planner-demo/session.ts` (real corpus ids, Wikimedia Commons
  photos with credits) and ships: `services/plannerDemo.ts` plays it as a synthetic backend
  whenever `streamPlannerTurn` finds no ai_api URL or a 404/405 on `/planner` (TRA-158), the hook
  reports `demo: true` and the page shows `DemoBanner`; the day the real route answers, no demo,
  no banner. The same session is the test double in unit tests and in `e2e/planner.spec.ts`
  (route mocked with it, plus one test where the route answers 404). Motion comes from the
  keyframes in `globals.css` (`animate-fade-up`, `animate-scale-in`, ...; `prefers-reduced-motion`
  is honoured globally). The "Save
  trip" button waits for the persistence issue (TRA-146). The page knows no city by name (TRA-168):
  `services/planner.ts::listCities` reads `GET /ai/planner/cities`, `hooks/usePlannerCities` loads it
  once, and `ChatColumn` turns it into one "Plan a trip to {city}" starter chip per city
  (`SuggestionChips`, only while the transcript is empty) and the destination hint of `QuickReplies`;
  the i18n copy (`plan.cityStarter`, `quickReplies.destinationPlaceholder`) is the fallback while the
  list loads, when the call fails, or without a backend.
- Tests: `renderWithProviders` from `src/test/render.tsx` and the typed builders in
  `src/test/fixtures.ts` (`src/test/fixtures/trip-japan.ts` when a test needs a whole `TripResponse`);
  assert on roles/names/`data-*` state and on `en.ts` copy, not on class names.
  Do not mock `Card`/`Section`/`Container`/`next/link` or `lucide-react` icon by icon.
- Playwright, three configs over one `e2e/` folder: `playwright.config.ts` (`just test-e2e`: starts
  `next dev` on :3000, the landing-page smoke suite, for the daily loop), `playwright.static.config.ts`
  (`just test-e2e-static`: `next build` served on :3100, adds `prerender.spec.ts`; CI's `frontend`
  job) and `playwright.stack.config.ts` (`just test-e2e-stack`: the running Compose stack on :8080,
  nothing started, every spec; CI's `e2e-stack` job). `trips.spec.ts` is the signed-in suite over the
  seeded trips: it writes `E2E_TOKEN` (`just dev-token <email>`) and the profile into `localStorage`
  with `page.addInitScript` before navigating, using the keys exported by `services/session.ts`, and
  skips itself entirely when `E2E_TOKEN` is unset, so the other two modes need no backend.
  `planner.spec.ts` signs in the same way, mocks `/api/v1/ai/planner` with the recorded session and
  aborts `**/tiles.openfreemap.org/**`, so the run needs no third party: the pins are DOM added when
  the map object is built, not when tiles arrive. The map needs WebGL 2, so `playwright.config.ts`
  launches Chromium with `--enable-unsafe-swiftshader` and without `WAYLAND_DISPLAY`: VS Code
  forwards that WSLg socket into the devcontainer and it breaks SwiftShader (no WebGL at all,
  see `.devcontainer/README.md`, TRA-180). The spec still checks `hasWebGL` and asserts the
  "map unavailable" fallback where there is none.

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
