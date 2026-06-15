# Travel AI World — Frontend

Next.js 16 (App Router) + Tailwind CSS v4 landing page for the Travel AI World project.

## Tech Stack

| Tool | Version | Purpose |
|---|---|---|
| [Next.js](https://nextjs.org/) | 16.1.6 (App Router) | Framework, routing, image optimization |
| [Tailwind CSS](https://tailwindcss.com/) | v4 | Styling via CSS custom properties |
| [TypeScript](https://www.typescriptlang.org/) | 5 | Type safety |
| [Inter](https://fonts.google.com/specimen/Inter) | via `next/font` | Typography |
| [Lucide](https://lucide.dev/) | 0.577.0 | Professional SVG iconography |

---

## Development with Dev Containers

This project includes a **Development Container** configuration (`.devcontainer/`) so you can spin up a reproducible environment with a single click in VS Code (or any compatible IDE).

1. **Open the folder** in VS Code and run **`Dev Containers: Re‑open in Container`** (or accept the prompt that appears).
2. VS Code will build the Docker image defined in `.devcontainer/Dockerfile` and start the services described in `.devcontainer/docker-compose.yml` (frontend, backend, PostgreSQL, scraper, plus a helper devcontainer service).
3. The repository source is mounted at `/workspace` inside the container, matching the `workspaceFolder` setting, so any edits you make are persisted to your host files.
4. After the container is ready, the `postCreateCommand` runs automatically:
   ```bash
   pip install -r backend/requirements.txt && npm install --prefix frontend
   ```
   installing backend Python dependencies and frontend Node packages.
5. The services are exposed on the host ports **3000** (frontend), **8000** (backend), **5432** (PostgreSQL) and **6333** (optional tools). Open `http://localhost:3000` to view the app.

You can now work exactly as described in the original **Getting Started** section, but everything runs inside an isolated Docker environment, ensuring the same versions of Node, Python, and other tools across all developers.

---

## Getting Started

```bash
npm install
npm run dev      # http://localhost:3000
npm run build    # production build check
```

---

## Project Structure

```
src/
├── app/                      # Next.js App Router (pages, layouts, routing) -> [README](src/app/README.md)
├── components/               # Reusable React UI building blocks -> [README](src/components/README.md)
├── context/                  # Global state providers (Language) -> [README](src/context/README.md)
├── i18n/                     # Internationalization setup and locales -> [README](src/i18n/README.md)
├── mocks/                    # Fake data for testing and offline dev -> [README](src/mocks/README.md)
├── services/                 # Centralized API communication layer -> [README](src/services/README.md)
├── test/                     # Global test setup and utilities -> [README](src/test/README.md)
├── types/                    # Shared TypeScript interfaces -> [README](src/types/README.md)
└── utils/                    # Pure JS/TS helper functions -> [README](src/utils/README.md)
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

1. `src/context/AuthContext.tsx` provides the `AuthContext` which manages the `user` object and `isAuthenticated` status. It uses a raw JWT `credential` as the source of truth.
2. `@react-oauth/google` handles the Google Sign-In button and token retrieval.
3. **Environment-Aware Validation**:
    - **Production**: Strictly requires a valid, non-expired Google JWT. Plain JSON objects in `localStorage` are rejected.
    - **Development**: Allows "mocking" by injecting a plain JSON object into `localStorage.travel_ai_user`, facilitating E2E testing and AI agent interaction.
4. Upon login, the JWT is stored in `localStorage.travel_ai_token` and decoded (via `jwt-decode`) to extract user profile info for the UI.
5. The `Header` component reacts to the `user` state to switch between "Login" and "Profile/Logout" views.
6. **Auto-Logout**: The app automatically clears session data and redirects to the home page if the stored token is detected as expired.


### Configuration

| Environment Variable | Required | Description |
|---|---|---|
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | Yes | Google Cloud Console OAuth Client ID |

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
| `/dashboard` | ✅ Live | Planned trips overview & status |
| `/plan` | ✅ Live | AI trip planner (form submission) |
| `/trip/[id]` | ✅ Live | Interactive itinerary viewer |

---

## Deployment

The site is deployed as a **static export** to **GitHub Pages**. See the root [`README.md`](../README.md#deployment) for full details.

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

GitHub Pages serves `404.html` (a copy of `index.html`) for any unknown path, so navigating to `/trip/real-id` boots the SPA and resolves correctly.

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

---

## Connecting the Backend

The backend is a **FastAPI** service (see [`backend/README.md`](../backend/README.md)).

1. Set `NEXT_PUBLIC_API_URL=http://localhost:8000` in `frontend/.env.local`
2. Set `NEXT_PUBLIC_GOOGLE_CLIENT_ID` to your Google OAuth Client ID in `frontend/.env.local`
3. `services/api.ts` provides `verifyGoogleToken()` for authentication and `streamChat()` for AI chat streaming
4. `PlannerCard.tsx` streams real AI responses via SSE when the backend is configured; falls back to a static "coming soon" mode when `NEXT_PUBLIC_API_URL` is unset (e.g. GitHub Pages)
5. `AuthContext.tsx` handles Google OAuth sessions with JWT-based validation and auto-logout on token expiry

