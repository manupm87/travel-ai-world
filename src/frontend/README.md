# Travel AI World — Frontend

Next.js 16 (App Router) + Tailwind CSS v4 web app for Travel AI World: landing page, dashboard, AI planner and itinerary viewer.

## Tech Stack

| Tool | Version | Purpose |
|---|---|---|
| [Next.js](https://nextjs.org/) | 16 (App Router, static export) | Framework, routing |
| [Tailwind CSS](https://tailwindcss.com/) | v4 | Styling via CSS custom properties |
| [TypeScript](https://www.typescriptlang.org/) | 5 | Type safety |
| [Inter](https://fonts.google.com/specimen/Inter) | via `next/font` | Typography |
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
├── app/            # Next.js App Router: pages, layouts, error/loading/not-found
├── components/     # UI by feature: ui/, layout/, landing/, dashboard/, trip-viewer/, auth/, common/
├── context/        # Providers: AuthContext, LanguageContext, ThemeContext
├── i18n/           # types.ts (contract), en.ts, es.ts, index.ts
├── services/       # The only place that talks to the network -> [README](src/services/README.md)
├── mocks/          # Trip fixtures used by services/trips.ts until the API serves trips
├── types/          # Hand-written domain types + generated/ (from OpenAPI, never edited)
├── utils/          # Pure helpers (formatting, country flags)
└── test/           # Vitest global setup
```

---

## Internationalization (i18n)

The app supports **English** and **Spanish**, switchable at runtime via the language toggle in the header. No page reload or route change is needed.

### How it works

1. `src/i18n/types.ts` defines the `Translations` interface — the contract every locale file must satisfy.
2. `src/i18n/en.ts` and `src/i18n/es.ts` each export a typed `Translations` object.
3. `src/i18n/index.ts` assembles the `locales` map (`Record<Language, Translations>`).
4. `LanguageProvider` (in `layout.tsx`) holds the active language in React state and provides `t` (the current locale's translations) and `setLanguage` to the whole tree.
5. Every component calls `const { t } = useLanguage()` and uses `t.section.key` — no hardcoded strings anywhere.

### Adding a new language (e.g. French)

1. Create `src/i18n/fr.ts` — copy `en.ts` and translate. TypeScript will tell you if you miss any keys.
2. Add `"fr"` to the `Language` union in `src/i18n/types.ts`.
3. Add `fr` to the `locales` map in `src/i18n/index.ts`.
4. Add the flag + code to the `FLAG` map in `Header.tsx`.

That's it — no other files need to change.

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
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | Yes | Google Cloud Console OAuth Client ID |
| `NEXT_PUBLIC_API_URL` | No | `core_api` URL; when set, sign-in is verified server-side |
| `NEXT_PUBLIC_AI_API_URL` | No | `ai_api` URL; defaults to `NEXT_PUBLIC_API_URL` |

- **Local**: Add to `.env.local` (ignored by git).
- **Production**: Configured as a **GitHub Repository Secret** named `GOOGLE_CLIENT_ID`, which is injected during the build step in `.github/workflows/deploy.yml`.

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
| `/dashboard` | ✅ Live | Trips overview (mock data) and the AI planner card (`PlannerCard`) |
| `/trip/[id]` | ✅ Live | Interactive itinerary viewer (mock data) |
| anything else | ✅ | `not-found.tsx`, exported as `404.html` |

---

## Deployment

The site is deployed as a **static export** to **GitHub Pages**. See the root [`README.md`](../../README.md#deployment) for full details.

### Static export config (`next.config.ts`)

| Setting | Value | Why |
|---|---|---|
| `output` | `'export'` | Generates plain HTML/CSS/JS — no Node.js server needed |
| `trailingSlash` | `true` | GH Pages serves `path/index.html`, not `path.html` |
| `basePath` | `/travel-ai-world` (prod only) | Project pages live at `/<repo-name>/` on GH Pages |
| `images.unoptimized` | `true` | Image optimisation requires a server; disabled for static export |

### Dynamic route: `/trip/[id]`

Next.js App Router can't mix `"use client"` and `generateStaticParams` in the same file, so the route is split:

- **`page.tsx`** — server component; exports `generateStaticParams([{ id: '_' }])` to produce one HTML shell
- **`TripClientPage.tsx`** — client component; reads the real ID via `useParams()` at runtime and will fetch from the API

For ids that were not pre-rendered, GitHub Pages serves the exported `404.html`; the client then reads the id and loads the trip.

---

## Testing

The project uses a two-tier testing strategy to ensure reliability:

### Unit & Component Testing

Powered by **Vitest** and **React Testing Library**.

```bash
npm run test:unit
```

Focuses on utility functions (formatting, date logic) and individual React components.

### End-to-End (E2E) Testing

Powered by **Playwright**.

```bash
npm run test:e2e
```

Verifies complete user flows, like creating a trip and navigating the dashboard.

`@playwright/mcp` is also a devDependency: the repo's `.mcp.json` runs it so coding agents can
drive the same headless Chromium (`npx playwright install --with-deps chromium` installs it).

---

## Connecting the Backend

1. Set `NEXT_PUBLIC_API_URL=http://localhost:8000` and `NEXT_PUBLIC_AI_API_URL=http://localhost:8001`
   in `.env.local` (one URL is enough behind the Docker Compose proxy on `:8080`).
2. `services/auth.ts` (`loginWithGoogle`) talks to `core_api`; `services/chat.ts` (`streamChat`)
   consumes `ai_api`'s SSE stream; `services/trips.ts` still serves the fixtures in `src/mocks/`.
3. `PlannerCard.tsx` streams real answers when `ai_api` is reachable and shows a static
   "coming soon" mode otherwise (the GitHub Pages build sets no API URL).
4. `services/session.ts` keeps the session in `localStorage`, validates the JWT and prunes it on expiry.

Backend details: [`src/backend/README.md`](../backend/README.md).
