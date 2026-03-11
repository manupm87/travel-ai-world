# Travel AI World — Claude Context

## Project Summary

AI-powered travel planning web app. Users describe their trip and an AI generates a personalized day-by-day itinerary.

**Live site:** https://manupm87.github.io/travel-ai-world/
**Status:** Frontend landing page is live. Backend (FastAPI + LLM) is planned but not yet built.

---

## Monorepo Structure

```
travel-ai-world/
├── frontend/          # Next.js 16 (App Router) — active development
├── ideas.pen          # Pencil design file — use Pencil MCP tools to read/edit
├── images/            # Design assets and AI-generated city images
└── .github/
    └── workflows/
        └── deploy.yml # Deploys frontend/out/ to GitHub Pages on push to main
```

---

## Frontend Stack

| Tool           | Version | Notes                                      |
|----------------|---------|--------------------------------------------|
| Next.js        | 16      | App Router, static export (`output: 'export'`) |
| React          | 19      |                                            |
| TypeScript     | 5       |                                            |
| Tailwind CSS   | v4      | CSS custom properties, NOT v3 utilities    |
| Inter          | via `next/font` | Primary typeface                  |

**Working directory for all frontend commands:** `frontend/`

---

## Key Conventions

### Styling — Tailwind CSS v4
- Design tokens are CSS custom properties defined in `src/app/globals.css`
- Use them via `var(--token-name)` in inline styles or Tailwind arbitrary values
- **Never** use Tailwind v3 config (`tailwind.config.js`) — v4 is config-less

Core tokens:
| Token                   | Value     | Usage                        |
|-------------------------|-----------|------------------------------|
| `--color-bg-primary`    | `#0A0A12` | Main page background         |
| `--color-bg-secondary`  | `#0E0E1A` | Alternating section BG       |
| `--color-bg-card`       | `#13132A` | Card / panel BG              |
| `--color-accent`        | `#4F6EF7` | Primary CTA blue             |
| `--color-text-secondary`| `#8888AA` | Muted text, labels           |

### Internationalization (i18n)
- Supported languages: **English** (`en`) and **Spanish** (`es`)
- Pattern: `const { t } = useLanguage()` → use `t.section.key`
- **No hardcoded strings in components** — all strings go in the locale files
- Locale files: `src/i18n/en.ts`, `src/i18n/es.ts`
- Contract type: `src/i18n/types.ts` → `Translations` interface
- Adding a language: create `src/i18n/<code>.ts`, add to `Language` union in `types.ts`, add to `locales` map in `index.ts`, add flag in `Header.tsx`

### Components
- All sections are in `src/components/sections/`
- Layout components (Header, Footer) are in `src/components/layout/`
- Shared UI atoms are in `src/components/ui/`
- Language state lives in `src/context/LanguageContext.tsx` via `LanguageProvider`

### File Naming
- React components: `PascalCase.tsx`
- Utility/config files: `camelCase.ts`
- i18n locale files: `<lang-code>.ts` (e.g. `en.ts`)

---

## Common Commands

```bash
# All commands run from the frontend/ directory
cd frontend

npm run dev        # Dev server at http://localhost:3000
npm run build      # Production static export → frontend/out/
npm run lint       # ESLint check
npm run test:e2e   # Playwright E2E smoke tests (auto-starts dev server)
```

---

## Browser Testing & Navigation

Two complementary tools are available:

### 1. Playwright E2E tests (automated)

Config: `frontend/playwright.config.ts` — Chromium, baseURL `http://localhost:3000`, auto-starts dev server.
Tests: `frontend/e2e/smoke.spec.ts`

```bash
cd frontend
npm run test:e2e              # Run all smoke tests
npx playwright show-report    # Open HTML test report

# Test against the live GitHub Pages site:
PLAYWRIGHT_BASE_URL=https://manupm87.github.io/travel-ai-world npx playwright test
```

**Smoke tests cover:** page title, hero headline, nav links, language switcher (EN ↔ ES), features section, social proof stats, CTA button, `/plan` stub, `/trip/:id` stub.

### 2. Live browser inspection (AI agent browser tools)

Use out-of-the-box mechanisms to control the browser:
- **Antigravity Browser Subagent**: Has built-in capability to spawn a browser subagent and interact with the site securely.
- **Playwright MCP**: If using Claude Code or other MCP-compatible clients, use the Playwright MCP to automate browser interactions.

Just ask the agent to do things:
- *"Navigate to http://localhost:3000 and take a screenshot"*
- *"Click the ES language button and verify the nav changes"*

Use the `/check-site` slash command for a full checklist of both modes.

---

## Deployment

- **Trigger:** push to `main` → `.github/workflows/deploy.yml` fires automatically
- **Build:** `npm run build` with `NEXT_PUBLIC_BASE_PATH=/travel-ai-world`
- **Output:** `frontend/out/` (static HTML/CSS/JS)
- **Host:** GitHub Pages at `https://manupm87.github.io/travel-ai-world/`
- **SPA fallback:** `out/404.html` is a copy of `out/index.html`; this lets `/trip/<id>` work via client-side routing

### Local vs. Production differences
| Setting         | Local dev       | GitHub Pages                  |
|-----------------|-----------------|-------------------------------|
| `basePath`      | *(none)*        | `/travel-ai-world`            |
| Image optimize  | On              | Off (`unoptimized: true`)     |
| URL             | `localhost:3000`| `manupm87.github.io/travel-ai-world/` |

---

## App Routes

| Route        | Status    | Description                                       |
|--------------|-----------|---------------------------------------------------|
| `/`          | ✅ Live    | Full landing page                                 |
| `/plan`      | 🔜 Stub   | AI trip planner form (needs backend)              |
| `/trip/[id]` | 🔜 Stub   | Generated itinerary viewer (needs backend)        |

The `/trip/[id]` route is split into two files to satisfy Next.js App Router constraints:
- `page.tsx` — server component, exports `generateStaticParams`
- `TripClientPage.tsx` — client component, reads real ID via `useParams()` at runtime

---

## Backend (Planned)

- **Stack:** FastAPI + Python + LLM integration
- **Location:** `backend/` (not yet created)
- **Integration point:** When ready, add `NEXT_PUBLIC_API_URL` to `frontend/.env.local` and wire `PlannerCard.tsx` form submit to `POST /api/trips`

---

## Design Assets

- **`ideas.pen`** — Pencil design file containing the full landing page layout, design system, color tokens, and component references. Use the **Pencil MCP tools** (`mcp_pencil_*`) to read or edit this file — never open it with regular file tools.
- **`images/`** — AI-generated city images (isometric claymorphism style) used as city card thumbnails
