# Travel AI World — Frontend

Next.js 15 (App Router) + Tailwind CSS v4 landing page for the Travel AI World project.

## Tech Stack

| Tool | Version | Purpose |
|---|---|---|
| [Next.js](https://nextjs.org/) | 16 (App Router) | Framework, routing, image optimization |
| [Tailwind CSS](https://tailwindcss.com/) | v4 | Styling via CSS custom properties |
| [TypeScript](https://www.typescriptlang.org/) | 5 | Type safety |
| [Inter](https://fonts.google.com/specimen/Inter) | via `next/font` | Typography |

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
├── app/
│   ├── layout.tsx            # Root layout — wraps app with LanguageProvider
│   ├── page.tsx              # Landing page — assembles all section components
│   ├── globals.css           # Design tokens (colors, fonts) as CSS custom properties
│   ├── plan/
│   │   └── page.tsx          # /plan — stub (AI planner form, coming soon)
│   └── trip/[id]/
│       ├── page.tsx          # Server wrapper — exports generateStaticParams
│       └── TripClientPage.tsx # Client component — reads ID via useParams() at runtime
│
├── components/
│   ├── layout/
│   │   ├── Header.tsx        # Sticky nav with logo + language switcher
│   │   └── Footer.tsx        # Footer with link columns and copyright
│   └── sections/
│       ├── HeroSection.tsx   # Hero — headline, CTAs, hero image
│       ├── PlannerCard.tsx   # AI planner form — inputs + travel style pills
│       ├── HowItWorks.tsx    # 3-step explainer
│       ├── FeaturesSection.tsx  # 6 feature cards
│       ├── SocialProof.tsx   # Stats + testimonials
│       └── FinalCTA.tsx      # Bottom call-to-action section
│
├── context/
│   └── LanguageContext.tsx   # Language state provider + useLanguage() hook
│
└── i18n/
    ├── types.ts              # Translations interface (shared contract)
    ├── en.ts                 # 🇬🇧 English strings
    ├── es.ts                 # 🇪🇸 Spanish strings
    └── index.ts              # Barrel — assembles locales map, re-exports types
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
| `/plan` | 🔜 Stub | AI trip planner form (needs backend) |
| `/trip/[id]` | 🔜 Stub | Generated itinerary viewer (needs backend) |

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

## Connecting the Backend

The backend will be a FastAPI service (see root `README.md`). When ready:

1. Add a `.env.local` with `NEXT_PUBLIC_API_URL=http://localhost:8000`
2. Wire `PlannerCard.tsx`'s form submit to `POST /api/trips`
3. Use the returned trip `id` to navigate to `/trip/[id]`
