# Frontend Architecture Review & Refactoring Guide

> **Purpose:** This document is the single source of truth for architecture improvements in the `travel-ai-world` frontend. AI agents and developers should consult it before implementing changes to ensure consistency and avoid regressions.
>
> **Last updated:** 2026-03-13

---

## Tech Stack

- **Framework:** Next.js 16 (App Router, static export via `output: "export"`)
- **Language:** TypeScript 5 (strict mode)
- **Styling:** Tailwind CSS v4 with `@theme inline` custom properties
- **Testing:** Playwright (e2e only — no unit test framework yet)
- **i18n:** Custom context-based system (`LanguageContext` + locale files)
- **Deployment:** GitHub Pages (static HTML)

---

## Project Structure

```
frontend/src/
├── app/
│   ├── layout.tsx                  ← Root layout (Inter font, LanguageProvider)
│   ├── page.tsx                    ← Landing page (Server Component)
│   ├── globals.css                 ← Design tokens + base styles
│   ├── dashboard/
│   │   ├── page.tsx                ← Server wrapper
│   │   └── DashboardClientPage.tsx ← Client component
│   └── trip/[id]/
│       ├── page.tsx                ← Server wrapper + generateStaticParams
│       └── TripClientPage.tsx      ← Client component
├── components/
│   ├── layout/
│   │   ├── Header.tsx
│   │   └── Footer.tsx
│   ├── sections/                   ← Landing page sections
│   │   ├── HeroSection.tsx
│   │   ├── PlannerCard.tsx
│   │   ├── HowItWorks.tsx
│   │   ├── FeaturesSection.tsx
│   │   ├── SocialProof.tsx
│   │   └── FinalCTA.tsx
│   └── trip-viewer/                ← Trip detail page components
│       ├── TripCard.tsx
│       ├── TripHeader.tsx          ← Also contains BudgetCard (co-located)
│       ├── DestinationTimeline.tsx
│       ├── JourneyMap.tsx
│       ├── TripOverview.tsx
│       ├── AIInsights.tsx
│       └── Itinerary.tsx           ← Also contains DayCard, ActivityItem
├── context/
│   └── LanguageContext.tsx          ← useLanguage() hook + LanguageProvider
├── i18n/
│   ├── index.ts                    ← Barrel export
│   ├── types.ts                    ← Translations interface
│   ├── en.ts
│   └── es.ts
├── mocks/
│   ├── trips-list.json
│   ├── trip-grand-european-tour.json
│   ├── trip-japan.json
│   ├── trip-new-york.json
│   └── trip-prague-vienna-budapest.json
└── types/
    ├── trip.ts                     ← Full Trip type hierarchy
    └── trip-summary.ts             ← TripSummary interface
```

---

## Design Tokens

Defined in `src/app/globals.css` as Tailwind v4 `@theme inline` variables. **All components must use these token names** via Tailwind classes, not raw hex values.

| Token name | Hex value | Tailwind class |
|---|---|---|
| `--color-bg-primary` | `#0A0A12` | `bg-bg-primary` |
| `--color-bg-secondary` | `#0E0E1A` | `bg-bg-secondary` |
| `--color-bg-card` | `#13132A` | `bg-bg-card` |
| `--color-bg-footer` | `#070710` | `bg-bg-footer` |
| `--color-accent` | `#4F6EF7` | `bg-accent`, `text-accent` |
| `--color-accent-soft` | `rgba(79,110,247,0.15)` | `bg-accent-soft` |
| `--color-accent-border` | `rgba(79,110,247,0.3)` | `border-accent-border` |
| `--color-text-primary` | `#FFFFFF` | `text-text-primary` |
| `--color-text-secondary` | `#8888AA` | `text-text-secondary` |
| `--color-text-muted` | `rgba(255,255,255,0.5)` | `text-text-muted` |
| `--color-border` | `rgba(255,255,255,0.08)` | `border-border` |
| `--color-border-soft` | `rgba(255,255,255,0.12)` | `border-border-soft` |
| `--color-gold` | `#F5A623` | `text-gold` |

### Additional tokens to add

These colors are used across the codebase but lack token definitions:

| Suggested token | Hex | Used for |
|---|---|---|
| `--color-accent-hover` | `#3B5BDB` | Button hover states |
| `--color-bg-surface` | `#1A1A24` | TripCard, elevated surfaces |
| `--color-border-card` | `#2A2A35` | TripCard borders |
| `--color-status-planning` | `#F78E4F` | Planning status badge |
| `--color-status-finished` | `#888899` | Finished status badge |
| `--color-purple` | `#8B5CF6` | "Free day" itinerary badge |

---

## Refactoring Items

### R1 · Replace Hardcoded Hex Colors with Tokens ✅

**Status:** Completed 🟢  
**Priority:** 🔴 P0 — Do this first  
**Effort:** Low (find-and-replace)

~~Every component hardcodes hex values instead of using the tokens above. This must be fixed before any other visual work.~~
Every component has been updated to use the established design tokens. Hex values have been normalized and hardcoded values removed from the source code.


**Mapping of raw values → token classes:**

```
bg-[#0A0A12]    → bg-bg-primary
bg-[#0E0E1A]    → bg-bg-secondary
bg-[#13132A]    → bg-bg-card
bg-[#070710]    → bg-bg-footer
bg-[#4F6EF7]    → bg-accent
text-[#4F6EF7]  → text-accent
text-[#8888AA]  → text-text-secondary
text-[#F5A623]  → text-gold
border-white/5   → border-border
border-white/10  → border-border-soft  (or keep as-is if opacity differs)
```

**Files to update:** All files under `src/components/` and `src/app/`.

> [!CAUTION]
> `TripCard.tsx` uses `#888899` while all other files use `#8888AA`. Normalize to `text-text-secondary` to fix this inconsistency.

---

### R2 · Extract Shared Layout & UI Components ✅
 
 **Status:** Completed 🟢  
 
 Reusable UI components (`Container`, `SectionLabel`, `Card`, `Button`) have been created and applied across all landing page sections and trip viewer components, ensuring layout consistency and eliminating duplicated code.

**Priority:** 🔴 P0  
**Effort:** Low

Create these files under `src/components/ui/`:

#### `Container.tsx`
Replaces the pattern `max-w-[1440px] w-full mx-auto px-8 lg:px-16` (repeated 15+ times):

```tsx
interface ContainerProps {
  children: React.ReactNode;
  className?: string;
}

export function Container({ children, className = "" }: ContainerProps) {
  return (
    <div className={`max-w-[1440px] w-full mx-auto px-8 lg:px-16 ${className}`}>
      {children}
    </div>
  );
}
```

#### `SectionLabel.tsx`
Replaces `text-accent text-[11px] font-bold tracking-[3px] uppercase` (6+ occurrences):

```tsx
export function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-accent text-[11px] font-bold tracking-[3px] uppercase">
      {children}
    </p>
  );
}
```

#### `Card.tsx`
Replaces `bg-bg-card rounded-2xl p-6 border border-border` (8+ occurrences):

```tsx
interface CardProps {
  children: React.ReactNode;
  className?: string;
  highlight?: boolean;
}

export function Card({ children, className = "", highlight = false }: CardProps) {
  return (
    <div className={`bg-bg-card rounded-2xl p-6 border ${
      highlight ? "border-accent-border bg-accent-soft" : "border-border"
    } ${className}`}>
      {children}
    </div>
  );
}
```

#### `Button.tsx`
Replaces the recurring CTA button pattern:

```tsx
interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost";
  as?: "button" | "a";
  href?: string;
}
```

Variants:
- `primary`: `bg-accent hover:bg-accent-hover text-white font-semibold`
- `secondary`: `bg-white/5 hover:bg-white/10 border border-border-soft text-white/80`
- `ghost`: `bg-transparent hover:bg-white/5 text-text-secondary hover:text-white`

---

### R3 · Create Data Service Layer ✅
 
 **Status:** Completed 🟢  

 Centralized trip data fetching has been implemented in `src/services/trips.ts`. Consumers (Dashboard and Trip Detail pages) have been refactored to fetch data server-side and receive it as props, eliminating direct JSON imports and decoupling the UI from the data source.

**Priority:** 🟠 P1  
**Effort:** Medium

Create `src/services/trips.ts`:

```tsx
import type { Trip } from "@/types/trip";
import type { TripSummary } from "@/types/trip-summary";

// Today: reads from JSON. Tomorrow: calls an API.
const tripModules: Record<string, () => Promise<{ default: unknown }>> = {
  trip_euro_2026: () => import("@/mocks/trip-grand-european-tour.json"),
  trip_japan_2026: () => import("@/mocks/trip-japan.json"),
  trip_ny_2025: () => import("@/mocks/trip-new-york.json"),
  trip_prague_vienna_budapest_2024: () => import("@/mocks/trip-prague-vienna-budapest.json"),
};

export function getAllTripIds(): string[] {
  return Object.keys(tripModules);
}

export async function getTripById(id: string): Promise<Trip | null> {
  const loader = tripModules[id];
  if (!loader) return null;
  const mod = await loader();
  return mod.default as Trip; // TODO: validate with Zod
}

export async function getTripSummaries(): Promise<TripSummary[]> {
  const mod = await import("@/mocks/trips-list.json");
  return mod.default as TripSummary[];
}
```

**Then update:**
1. `app/trip/[id]/page.tsx` → use `getAllTripIds()` in `generateStaticParams`
2. `app/trip/[id]/TripClientPage.tsx` → use `getTripById()` instead of direct imports
3. `app/dashboard/DashboardClientPage.tsx` → use `getTripSummaries()` instead of direct import

> [!IMPORTANT]
> Adding a new trip currently requires edits in 3 places: the mock JSON file, `TripClientPage.tsx` mockDataMap, and `page.tsx` `generateStaticParams`. After this refactoring, only the JSON file and `services/trips.ts` registry need updating.

---

### R4 · Extract Shared Utilities ✅
 
 **Status:** Completed 🟢  

 Shared utilities for formatting (dates, currency, duration) and country flags have been extracted to `src/utils/` and applied across all trip-viewer components, ensuring consistent data representation and cleaner code.

**Priority:** 🟡 P2  
**Effort:** Low

#### `src/utils/format.ts`

```tsx
/**
 * Locale-aware date formatting.
 * @param dateStr - ISO date string
 * @param locale - BCP47 locale (e.g., "en-US", "es-ES")
 * @param options - Intl.DateTimeFormat options
 */
export function formatDate(
  dateStr: string,
  locale = "en-US",
  options: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", year: "numeric" }
): string {
  return new Date(dateStr).toLocaleDateString(locale, options);
}

/**
 * Locale-aware currency formatting.
 */
export function formatCurrency(
  amount: number,
  currency: string,
  locale = "en-US"
): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}
```

**Replaces inline implementations in:** `TripHeader.tsx` (L10-16, L60, L103), `DestinationTimeline.tsx` (L9-13), `Itinerary.tsx` (L92-98, L177), `TripOverview.tsx` (L33).

#### `src/utils/countryFlag.ts`

```tsx
const FLAGS: Record<string, string> = {
  FR: "🇫🇷", IT: "🇮🇹", ES: "🇪🇸", JP: "🇯🇵", US: "🇺🇸",
  DE: "🇩🇪", GB: "🇬🇧", PT: "🇵🇹", NL: "🇳🇱", CZ: "🇨🇿",
  AT: "🇦🇹", HU: "🇭🇺",
};

export function getFlag(countryCode: string): string {
  return FLAGS[countryCode] ?? "🏳️";
}
```

**Replaces hardcoded ternary chains in:** `DestinationTimeline.tsx` (L32), `JourneyMap.tsx` (L28), `Itinerary.tsx` (L13-18).

---

### R5 · Complete i18n for Trip Viewer ✅
 
 **Status:** Completed 🟢  
 
 Full internationalization support has been implemented across all trip-viewer components through the `useLanguage()` hook. All hardcoded labels, date formats, and accessibility descriptions have been moved to the translation layer (English and Spanish), ensuring a consistent and localized experience.

**Priority:** 🟡 P2  
**Effort:** Medium

Extend the `Translations` interface in `src/i18n/types.ts` with:

```tsx
tripViewer: {
  backToDashboard: string;
  travelers: string;
  totalBudget: string;
  viewBookings: string;
  exportPdf: string;
  journeyMap: string;
  routeOverview: string;
  tripOverview: string;
  accommodations: string;
  transportation: string;
  aiInsights: string;
  weatherForecast: string;
  localTips: string;
  yourItinerary: string;
  allDays: string;
  freeDay: string;
  travel: string;
  dining: string;
  bookingRequired: string;
  nights: string;
  estimated: string;
  selfPlanned: string;
};
common: {
  planning: string;
  planned: string;
  finished: string;
};
```

**Then update translations in `en.ts` and `es.ts`, and update all trip-viewer components to use `useLanguage()`.**

> [!WARNING]
> `Header.tsx` line 85 has the string "My Dashboard" hardcoded — also needs i18n.

---

### R6 · Split Large Component Files ✅
 
 **Status:** Completed 🟢  

 Large monolithic components (`Itinerary`, `TripHeader`) have been split into smaller, modular sub-components and moved to dedicated directories (`src/components/trip-viewer/itinerary/` and `src/components/trip-viewer/trip-header/`). This improves maintainability, readability, and organization of the codebase.

**Priority:** 🟢 P3  
**Effort:** Low

**Itinerary (197 lines, 3 components):**

```
src/components/trip-viewer/itinerary/
├── Itinerary.tsx        ← Main component with filter state
├── DayCard.tsx           ← Expandable day card
├── ActivityItem.tsx      ← Single activity row
└── index.ts              ← export { default } from "./Itinerary"
```

**TripHeader (108 lines, 2 components):**

```
src/components/trip-viewer/trip-header/
├── TripHeader.tsx
├── BudgetCard.tsx
└── index.ts
```

---

### R7 · Fix Code Quality Issues
 
 **Status:** Pending ⚪  

**Priority:** 🟢 P3  
**Effort:** Low

| File | Issue | Fix |
|---|---|---|
| `DashboardClientPage.tsx` L3 | Imports `useEffect` but never uses it | Remove unused import |
| `DashboardClientPage.tsx` L17-19 | `.filter((t) => ...)` shadows outer `t` from `useLanguage()` | Rename to `.filter((trip) => ...)` |
| `AIInsights.tsx` L8 | Destructures `trip` as `{}` — prop received but entirely unused | Either use the prop data or remove from interface |
| `TripClientPage.tsx` L30 | `as unknown as Trip` double-cast | Validate with Zod or add proper JSON typing |
| `TripCard.tsx` L57 | Uses `#888899` while rest of codebase uses `#8888AA` | Normalize to `text-text-secondary` |
| `Itinerary.tsx` L113 | Dynamic class string manipulation: `primaryColor.replace(...)` | Use explicit conditional classes instead |

---

### R8 · Add Unit Testing Framework
 
 **Status:** Pending ⚪  

**Priority:** 🟢 P3  
**Effort:** Medium

1. Install Vitest + React Testing Library:
   ```bash
   npm i -D vitest @testing-library/react @testing-library/jest-dom jsdom
   ```
2. Add `vitest.config.ts` at root
3. Add `"test:unit": "vitest"` to `package.json` scripts
4. Priority test coverage:
   - `utils/format.ts` — pure functions, easy wins
   - `utils/countryFlag.ts` — pure function
   - `services/trips.ts` — data layer
   - `Itinerary.tsx` — most complex component (filter + expand logic)

---

### R9 · Accessibility Improvements
 
 **Status:** Pending ⚪  

**Priority:** 🟢 P3  
**Effort:** Medium

| Issue | Location | Fix |
|---|---|---|
| Clickable `<div>` without keyboard support | `Itinerary.tsx` L103-106 (`DayCard` header) | Use `<button>` or add `role="button"` + `tabIndex={0}` + `onKeyDown` |
| Missing `aria-pressed` on toggle buttons | `PlannerCard.tsx` style pills, `Itinerary.tsx` filter buttons | Add `aria-pressed={active}` |
| Flag emojis without alt text | `DestinationTimeline.tsx`, `JourneyMap.tsx` | Wrap in `<span role="img" aria-label="France">🇫🇷</span>` |
| Missing `<main>` landmark | `DashboardClientPage.tsx`, `TripClientPage.tsx` outer `<div>` | The outer `<div>` should be/contain a `<main>` |

---

### R10 · Error Boundaries & Edge Cases
 
 **Status:** Pending ⚪  

**Priority:** 🟢 P3  
**Effort:** Low

- Add a React `ErrorBoundary` component in `src/components/ui/ErrorBoundary.tsx`
- Wrap trip-viewer page in ErrorBoundary
- Replace silent fallback to `tripEuro` in `TripClientPage.tsx` L29 with explicit 404 / "Trip not found" UI
- Add skeleton/loading states for future async data fetching

---

## Order of Operations

When implementing, follow this order to minimize conflicts:

1. **R1** (token replacement) — foundation for everything else
2. **R2** (shared components) — creates the building blocks
3. **R4** (utilities) — DRY up formatting
4. **R3** (data service) — decouple data loading
5. **R5** (i18n) — complete bilingual support
6. **R7** (code quality) — cleanup pass
7. **R6** (file splitting) — structural improvement
8. **R8** (testing) — add quality guardrails
9. **R9** (a11y) — compliance
10. **R10** (error handling) — robustness
