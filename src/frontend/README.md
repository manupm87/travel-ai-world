# Travel AI World — Frontend

Next.js 16 (App Router) + Tailwind CSS v4 web app for Travel AI World: landing page, dashboard, AI planner and itinerary viewer.

## Tech Stack

| Tool | Version | Purpose |
|---|---|---|
| [Next.js](https://nextjs.org/) | 16 (App Router, static export) | Framework, routing |
| [Tailwind CSS](https://tailwindcss.com/) | v4 | Styling via CSS custom properties |
| [TypeScript](https://www.typescriptlang.org/) | 5 | Type safety |
| [Outfit](https://fonts.google.com/specimen/Outfit) + [Plus Jakarta Sans](https://fonts.google.com/specimen/Plus+Jakarta+Sans) | via `next/font` | Headings + body typography |
| [clsx](https://github.com/lukeed/clsx) + [tailwind-merge](https://github.com/dcastil/tailwind-merge) | | `cn()` for conflict-free class composition |
| [Lucide](https://lucide.dev/) | 1.x | SVG iconography |
| [Vitest](https://vitest.dev/) + [Playwright](https://playwright.dev/) | | Unit and E2E tests |
| [openapi-typescript](https://openapi-ts.dev/) | 7 | Backend types generated from OpenAPI |

---

## Getting Started

```bash
cp .env.example .env.local   # NEXT_PUBLIC_GOOGLE_CLIENT_ID, NEXT_PUBLIC_API_URL, NEXT_PUBLIC_AI_API_URL
npm install
npm run dev              # http://localhost:3000
npm run lint · npm run test:unit · npm run test:e2e
npm run build            # static export → out/
npm run types:generate   # regenerate src/types/generated from docs/api/*.openapi.json
```

## Backend services

The app talks to two services through `src/services/` only (see [its README](src/services/README.md)):

| Variable | Service | Default |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | `core_api` (auth, users, trips) | unset → backend features disabled |
| `NEXT_PUBLIC_AI_API_URL` | `ai_api` (chat) | falls back to `NEXT_PUBLIC_API_URL` |

Types for requests and responses are generated, never hand-written: `src/types/generated/`.

---

## Project Structure

```text
src/
├── app/            # Next.js App Router
│   ├── layout.tsx        # Root: fonts, providers (Google OAuth, Auth, Theme, Language)
│   ├── (marketing)/      # Public routes: layout = Header + Footer; page.tsx is the landing; auth/callback/ ends a Cognito sign-in
│   ├── (app)/            # Signed-in routes: layout = app shell + ProtectedRoute, once
│   │   ├── dashboard/    # page.tsx (server) + DashboardClientPage.tsx
│   │   └── trip/         # page.tsx (static shell, Suspense) + TripClientPage.tsx (?id=, useTrip)
│   └── error.tsx, loading.tsx, not-found.tsx
├── components/     # UI by feature: ui/, layout/, landing/, planner/, dashboard/, trip-viewer/, auth/, common/
├── context/        # Providers: AuthContext, LanguageContext, ThemeContext
├── hooks/          # useTrips, useTrip, useChatStream, useFormatters, useStickToBottom, useAutoResizeTextarea, useScrolled, useClickOutside
├── i18n/           # types.ts (contract), en.ts, es.ts, index.ts (locales + LANGUAGES), interpolate.ts
├── services/       # The only place that talks to the network -> [README](src/services/README.md)
├── types/          # Hand-written domain types + generated/ (from OpenAPI, never edited)
├── utils/          # Pure helpers (cn, formatting, country flags, localStorage store, safe redirect)
└── test/           # Vitest setup + renderWithProviders (render.tsx) + typed fixtures (fixtures.ts, fixtures/trip-japan.ts)
```

Route groups `(marketing)` and `(app)` do not appear in URLs; they exist so the header/footer and the
auth guard are declared in one layout each instead of in every page.

---

## Internationalization (i18n)

The app supports **English** and **Spanish**, switchable at runtime via the language toggle in the header. No page reload or route change is needed.

### How it works

1. `src/i18n/types.ts` defines the `Translations` interface — the contract every locale file must satisfy.
2. `src/i18n/en.ts` and `src/i18n/es.ts` each export a typed `Translations` object.
3. `src/i18n/index.ts` assembles the `locales` map (`Record<Language, Translations>`) and `LANGUAGES`,
   the single list of language metadata (`code`, `flag`, `nativeName`, BCP 47 `locale`) that the header
   switcher and the formatters read from.
4. `LanguageProvider` (in `layout.tsx`) holds the active language in React state and provides `t` (the
   current locale's translations), `locale` and `setLanguage` to the whole tree.
5. Every component calls `const { t } = useLanguage()` and uses `t.section.key` — no hardcoded strings
   anywhere. Templates with placeholders go through `interpolate(t.x.y, { name })`.
6. Dates and money are formatted with `useFormatters()` (`src/hooks/useFormatters.ts`), which binds
   `utils/format` to the active `locale`; components never map a language to a locale themselves.
7. `src/i18n/i18n.test.ts` checks that every locale has the same key structure and that `LANGUAGES`
   covers every `Language`.

### Adding a new language (e.g. French)

1. Create `src/i18n/fr.ts` — copy `en.ts` and translate. TypeScript will tell you if you miss any keys.
2. Add `"fr"` to the `Language` union in `src/i18n/types.ts`.
3. In `src/i18n/index.ts`, add `fr` to the `locales` map and an entry
   (`{ code: "fr", flag: "🇫🇷", nativeName: "Français", locale: "fr-FR" }`) to `LANGUAGES`.

That's it — the compiler flags a missing locale or `LANGUAGES` entry, and no component needs to change.

---

## Authentication

The app uses **Google OAuth 2.0** for frontend authentication. User state is managed via React Context and persisted in `localStorage`.

### How it works

1. `src/services/session.ts` is the only owner of the persisted session: it writes and clears
   `localStorage.travel_ai_token` / `localStorage.travel_ai_user` together and exposes
   `subscribe`/`getSnapshot` for `useSyncExternalStore`. `http.ts` reads the token through it.
2. `src/services/auth.ts` exports `loginWithGoogle(credential)`, which decides the mode:
   - **API mode** (`NEXT_PUBLIC_API_URL` set): `core_api` verifies the Google credential and issues our own JWT.
   - **Static mode** (no API URL, e.g. GitHub Pages): the Google ID token is decoded client-side (`jwt-decode`) for profile display only.
   It rejects on an invalid credential in both modes and leaves storage untouched.
3. `src/context/AuthContext.tsx` is a thin React binding: `user`, `isAuthenticated`, `isLoading`
   (until hydration), `login` and `logout`. It never navigates; the header's user menu goes home after `logout()`.
4. `@react-oauth/google` renders the Sign-In button; `LoginModal` calls `login` and only follows a
   `?redirect=` parameter that is a same-origin path (`src/utils/safeRedirect.ts`).
5. **Environment-aware validation**:
    - **Production**: a token must be a well-formed, non-expired JWT. A bare profile in `localStorage` is rejected.
    - **Development**: a plain JSON `User` in `localStorage.travel_ai_user` signs you in, for E2E tests and agents.
6. **Auto-logout**: an expired or corrupt session is pruned on mount, so it does not survive a reload.

### Configuration

| Environment Variable | Required | Description |
|---|---|---|
| `NEXT_PUBLIC_COGNITO_DOMAIN` | Deployed | The Cognito managed-login host (`terraform output cognito_domain`); with the client id below, sign-in goes through the user pool |
| `NEXT_PUBLIC_COGNITO_CLIENT_ID` | Deployed | The pool's app client id (`terraform output cognito_client_id`) |
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | Local | Google Cloud Console OAuth Client ID, for the Google button when no pool is configured |
| `NEXT_PUBLIC_API_URL` | No | `core_api` URL; when set, sign-in is verified server-side |
| `NEXT_PUBLIC_AI_API_URL` | No | `ai_api` URL; defaults to `NEXT_PUBLIC_API_URL` |

- **Local**: Add to `.env.local` (ignored by git).
- **Production**: the GitHub repository variables `COGNITO_DOMAIN` and `COGNITO_CLIENT_ID` (and the secret `GOOGLE_CLIENT_ID` for the fallback) are injected during the build step in `.github/workflows/deploy.yml`.

---

## Design Tokens

Defined in `globals.css` as CSS custom properties and consumed directly in Tailwind classes:

| Token | Value | Usage |
|---|---|---|
| `--color-bg-primary` | `#0A0A12` | Main page background |
| `--color-bg-secondary` | `#0E0E1A` | Section alternating background |
| `--color-bg-card` | `#13132A` | Card / panel backgrounds |
| `--color-accent` | `#4F6EF7` | Primary blue accent, CTAs |
| `--color-text-secondary` | `#8888AA` | Muted text, labels |

---

## Pages & Routes

| Route | Status | Description |
|---|---|---|
| `/` | ✅ Live | Full landing page |
| `/dashboard` | ✅ Live | The signed-in user's trips from `core_api` (`useTrips`, client-side; loading / error / empty states) and the AI planner card (`PlannerCard`) |
| `/trip/?id=<uuid>` | ✅ Live | Interactive itinerary viewer for one trip from `core_api` (`useTrip`, client-side; loading / not-found / error states) |
| `/plan/` (`/plan/?q=<prompt>`) | ✅ Live | The trip planner (layout A, TRA-144): three columns on a laptop — chat with quick replies and option-card carousels, the brief checklist that becomes the live itinerary, and the map of the selected day (MapLibre GL over OpenFreeMap's keyless tiles, TRA-147/ADR 0016) — and the same three as tabs on a phone; clicking a stop turns the middle column into that activity's page (photo, article, address, phone, site and directions, from `GET /ai/planner/card?id=`) and highlights its pin on the map (TRA-179) (`usePlanner`, client-side; SSE v2 events from `ai_api`'s `/planner`; until TRA-143 lands the page answers from the recorded Budapest session in `src/data/planner-demo/` and shows a demo banner) |
| anything else | ✅ | `not-found.tsx`, exported as `404.html` |

---

## Deployment

The site is deployed as a **static export** to a private S3 bucket behind CloudFront on AWS
(`.github/workflows/deploy.yml`; infrastructure in `infra/aws/frontend.tf`). Routes are exported
as `route/index.html`; a CloudFront Function maps `/route/` to that key. See the
[deploy runbook](../../docs/runbooks/deploy.md).

### Static export config (`next.config.ts`)

| Setting | Value | Why |
|---|---|---|
| `output` | `'export'` | Generates plain HTML/CSS/JS — no Node.js server needed |
| `trailingSlash` | `true` | GH Pages serves `path/index.html`, not `path.html` |
| `basePath` | `/travel-ai-world` (prod only) | Project pages live at `/<repo-name>/` on GH Pages |
| `images.unoptimized` | `true` | Image optimisation requires a server; disabled for static export |

### The trip viewer: `/trip/?id=<uuid>`

Trips belong to users and get their ids from the database, so no `/trip/<id>/` page can exist at
build time: a static export needs `dynamicParams = false` with every id enumerated, and an edge
rewrite would fix only the served build, not `next dev` or Playwright (ADR 0011). The viewer is
therefore **one static shell** with the id in the query string:

- **`page.tsx`** — server component; renders `TripClientPage` inside a `Suspense` boundary
  (required: `useSearchParams` on a prerendered route bails out to client rendering up to the
  nearest boundary, and the export build fails without one).
- **`TripClientPage.tsx`** — client component; `useSearchParams().get("id")` feeds `useTrip(id)`
  (`src/hooks/useTrip.ts`), which asks `services/trips.ts#getTrip` for `GET /api/v1/trips/{id}` and
  renders loading, not-found (no id, malformed id, 404 or 403), error (+ retry) or the viewer.

The export contains `out/trip/index.html` only; `/trip/<anything>/` is a plain 404. Dashboard cards
link to `/trip/?id=<uuid>`, and the route guard keeps the query string in its `redirect` parameter
so a signed-out deep link comes back to the same trip after sign-in.

### Per-user data on a static export: `/dashboard`

Trips belong to the signed-in user, so nothing about them exists at build time. `dashboard/page.tsx`
is a static shell; `DashboardClientPage.tsx` (client) calls `useTrips()` (`src/hooks/useTrips.ts`),
which asks `services/trips.ts#listTrips` for `GET /api/v1/trips/` with the session token once the
session is known, and renders one of four states: loading (`LoadingSpinner`), error (translated
message + retry), empty (`EmptyDashboard`) or the trips grouped by status. A 401 clears the session
and the route guard sends the visitor home. The trip viewer follows the same pattern with `useTrip`
(above).

---

## Testing

The project uses a two-tier testing strategy to ensure reliability:

### Unit & Component Testing

Powered by **Vitest** and **React Testing Library**.

```bash
npm run test:unit
```

Covers services (`http`, `chat`, `auth`, `session`), hooks, contexts and components. Component tests
render through `renderWithProviders` (`src/test/render.tsx`, the real `LanguageProvider` and
`ThemeProvider`) and build data with the typed builders in `src/test/fixtures.ts` (`makeTrip`,
`makeTripSummary`, ...). Assert on roles, accessible names and `data-*` state, and on the English
copy from `src/i18n/en.ts`, rather than on Tailwind class names.

### End-to-End (E2E) Testing

Powered by **Playwright**, with three configs over the one `e2e/` folder:

```bash
npm run test:e2e           # playwright.config.ts: starts `next dev` on :3000, the landing-page smoke suite
npm run test:e2e:static    # playwright.static.config.ts: `next build` served on :3100, adds prerender.spec.ts
npm run test:e2e:stack     # playwright.stack.config.ts: the Compose stack already running on :8080, every spec
```

`e2e/trips.spec.ts` is the signed-in suite (dashboard and trip viewer over the seeded trips). It
signs in by writing `E2E_TOKEN`, a local-mode JWT from `just dev-token <email>`, and the profile
into `localStorage` before the first navigation, and skips itself when `E2E_TOKEN` is unset. The
full flow is in the [local development runbook](../../docs/runbooks/local-dev.md#end-to-end-tests).

`@playwright/mcp` is also a devDependency: the repo's `.mcp.json` runs it so coding agents can
drive the same headless Chromium (`npx playwright install --with-deps chromium` installs it).

---

## Connecting the Backend

1. Set `NEXT_PUBLIC_API_URL=http://localhost:8000` and `NEXT_PUBLIC_AI_API_URL=http://localhost:8001`
   in `.env.local` (one URL is enough behind the Docker Compose proxy on `:8080`).
2. `services/auth.ts` (`loginWithGoogle`) talks to `core_api`; `services/chat.ts` (`streamChat`)
   consumes `ai_api`'s SSE stream; `services/trips.ts` (`listTrips`, `getTrip`) reads the dashboard's
   trips and the viewer's trip from `core_api`, mapped through `toTripSummary` / `toTrip` (ADR 0006).
   There is no fixture fallback: without `core_api` the signed-in pages show their error state.
3. `components/planner/PlannerCard.tsx` streams real answers when `ai_api` is reachable
   (`useChatStream`, which also aborts the stream on unmount). Without an AI URL (the GitHub Pages
   build) the composer stays usable but sending is disabled and `t.planner.unavailable` explains why.
4. `services/session.ts` keeps the session in `localStorage`, validates the JWT and prunes it on expiry.
5. The planner's map needs no backend and no key: `maplibre-gl` fetches OpenFreeMap's hosted styles
   (`tiles.openfreemap.org`) straight from the browser, only on `/plan/` and only through
   `next/dynamic` with `ssr: false`. Offline, the basemap is blank and everything else still works.

Backend details: [`src/backend/README.md`](../backend/README.md).
