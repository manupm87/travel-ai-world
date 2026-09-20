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
  through core_api), `chat.ts` (ai_api), `trips.ts` (`listTrips` reads the planner's list of trips from
  `GET /api/v1/trips/`; `getTrip` reads the one it reopens from `GET /api/v1/trips/{id}` and
  resolves `null` on 404 and on 403, so someone else's id looks exactly like a missing one; owns
  `toTrip`, the only place that turns a `TripResponse` into the `Trip` view model — ADR 0006),
  `tripDraft.ts` (`tripToDraft`, the pure inverse of the save: a saved trip back as the planner
  draft it was written from).
  Components never `fetch` or touch the session storage.
  **The writes live there too**: `createTrip`, `updateTrip`, `deleteTrip`, and
  `saveDraftAsTrip(itinerary, brief, city, { title, tripId? })`, which stores a whole planner draft
  as one trip. core_api takes no trip and its children in one body, so the snapshot is a
  **sequence** of small writes — never `Promise.all` on one trip: each day's activities need the id
  that day's answer carries. The mapping, in one place so the list and the reopened planner agree:
  **one trip is one city** (TRA-196), written from the `PlannerCity` the destination resolved to —
  slug, name, country, ISO code and centre, which is why `saveDraftAsTrip` takes it and the old
  hand-made `countryOf` table is gone; the brief becomes the trip's dates, travellers,
  `travel_style` (its interests), `pace_preference`, `origin` and `budget_tier`, with
  `budget_currency: "EUR"` and the stay's photo (or the draft's first) as the cover; each
  `DayDraft` becomes an itinerary day dated by `utils/tripDates.ts`, each card in it an activity
  with its `part_of_day`, the hour that part reads as (morning 10:00, afternoon 15:00, evening
  19:00, night 22:00), its corpus id in `source_ref` and **the whole card in `card`** — or a
  **meal** when the corpus category is `eat`, typed by the same part and with the card's subtitle
  as the cuisine, the corpus having no cuisine of its own; the stay becomes the accommodation
  (card and all) and the route its two legs. Prices, opening hours and bookings are left unset
  rather than invented. With a `tripId` the same trip is rewritten: the trip is patched, every
  child is deleted (days first — their activities and meals cascade) and the draft is written
  again. `services/tripDraft.ts::tripToDraft` is the exact inverse and is what `/plan/?trip=`
  hydrates from; a child with no stored card is rebuilt from its columns. Keeping a saved trip in
  step with the draft as it changes, without pressing Save, is still TRA-146.
  `AuthContext.provider` (`"cognito" | "google"`) says which sign-in the build has; it is decided by
  `NEXT_PUBLIC_COGNITO_DOMAIN` + `NEXT_PUBLIC_COGNITO_CLIENT_ID`.
  The one sanctioned exception is the planner map's tiles: `maplibre-gl` fetches
  `tiles.openfreemap.org` itself (ADR 0016). That is the library's own traffic, not app code —
  no component gains the right to call `fetch`.
- **Hooks own async state, components render it**: `src/hooks/useTrips.ts` loads the account's
  trips (`status: "loading" | "ready" | "error"`, `reload()`, aborts on unmount, clears the session
  on a 401 so the route guard redirects); `useTrip.ts` loads one trip for the planner the same way,
  with `"not-found"` as a fourth status (a missing or malformed id is not-found without a request;
  `getTrip`'s `null` is not-found too); `usePlanner.ts` drives the planner page over the pure reducer in
  `plannerReducer.ts` (every transition, including `applyItineraryOps`, is unit-tested without React;
  the hook owns the stream, aborts it on a new turn, and keeps the per-tab draft through
  `services/plannerDraft.ts`; `hydrate(draft, tripId)` opens a saved trip in its place and
  `startNew()` empties it, both moving the id "Save trip" writes to); `useSaveTrip.ts` owns "Save trip" (`idle | saving | saved | error`,
  the title in the reader's language, the resolved `PlannerCity` without which there is nothing
  valid to save, and the id of the trip the draft was saved as — the trip `?trip=` opened, or what
  this tab last wrote, kept beside the draft by `plannerDraft.ts` — so a second press updates that
  trip instead of leaving a second one behind, and "New trip" forgets it); `useTrips.ts` also owns
  the list's own writes, `remove(id)` (optimistic, the card comes back if the API refuses) and
  `rename(id, title)` (not optimistic: the card shows what the API stored, and core_api refuses the
  write outright once the trip is no longer upcoming). A page
  that needs per-user data is a static shell (`page.tsx`) plus a client component using the hook,
  never a server-side fetch: the export is static.
- **`src/types/trip.ts` is a view model**, not a response shape: components render it, `services/trips.ts`
  builds it from the generated `TripResponse`. Since TRA-196 a `Trip` has **one `city`** (slug,
  name, country, code, centre), a `phase` core_api derives from its dates (`TRIP_PHASES` is the
  display order: ongoing, upcoming, past), and on every child the planner card it came from. There
  are no fixtures in the app: the only `TripResponse` object in the repo is the test fixture
  `src/test/fixtures/trip-budapest.ts`, built from the recorded session and checked with
  `satisfies`; add derived facts in the mapper, not in JSX.
- **Types from the backend are generated**: `src/types/generated/{core-api,ai-api}.ts` via
  `npm run types:generate` (from `docs/api/*.openapi.json`). Do not edit them; do not redeclare
  response shapes by hand — import `components["schemas"]["..."]`.
- **Two base URLs**: `NEXT_PUBLIC_API_URL` (core) and optional `NEXT_PUBLIC_AI_API_URL` (defaults to
  core, for single-origin deployments). Static builds set neither; features degrade gracefully via
  `isApiAvailable()` / `isAiAvailable()`.
- Styling: CSS custom properties from `src/app/globals.css` (`--color-bg-primary`, `--color-accent`,
  `--color-error/success/warning`, `--header-h`, `--shadow-accent-glow`, `--shadow-field-glow`,
  `--glass-bg`/`--glass-border` — also `bg-glass-bg`/`border-glass-border` — and the three
  `--aurora-*` lights); no `tailwind.config.js`.
  Use the tokens (`text-error`, `pt-(--header-h)`, `shadow-accent-glow`), not palette literals like
  `text-red-400` or `rgba(79,110,247,…)`. Compose classes with `cn()` (`src/utils/cn.ts`) so a
  consumer's `p-8` reliably overrides a primitive's `p-6`. **What the tokens are for — palette,
  type, motion, copy and the quality floor — is
  [`docs/design/kyrian-world.md`](../../docs/design/kyrian-world.md)** (TRA-189); read it before
  designing a new surface. The living background is `components/layout/Aurora.tsx`: fixed,
  `aria-hidden`, click-through, mounted by the `(marketing)` layout and, for the signed-in shell,
  by `components/layout/AppAurora.tsx` (TRA-193) — a two-line client component that reads
  `usePathname` and stands aside on `/plan/`, the one route in `(app)` that paints its own panes.
  No page mounts the layer itself. `color-scheme` is declared per theme on the root, so the
  browser's own chrome — date pickers, select lists, scrollbars, the caret — follows the theme
  instead of drawing light on the dusk sky. The footer paints nothing: a band with a background
  and a top border cuts the aurora's amber horizon off in a straight line.
- **Lint enforces the boundaries** (`eslint.config.mjs`): no `fetch` outside `src/services/`, no
  `@/types/generated/*` outside `src/services/` and `src/types/`, imports first, `console` is a
  warning. `tsconfig` has `noUncheckedIndexedAccess`:
  key lookups on i18n ids (`TripStatus`, a `DayPart`) instead of indexing parallel arrays.
- Files: components `PascalCase.tsx`, utilities and hooks `camelCase.ts`, locales `<code>.ts`.
- Routes live in groups: `app/(marketing)/` (public; layout = the aurora, Header and Footer in a
  `min-h-dvh` column whose `main` takes what the footer leaves, includes `auth/callback/`, where
  Cognito sends the browser back) and `app/(app)/` (signed-in; layout = shell + `ProtectedRoute`).
  Do not wrap pages in `ProtectedRoute` again.
- **The landing is the field** (TRA-190): `/` is `components/landing/AskField.tsx` and nothing else
  — the question (the page's only `h1`, and the field's `aria-labelledby`), the field, the button.
  The placeholder types the example asks out one after another (`hooks/useTypewriter.ts`, pure and
  reduced-motion aware), which is why there is no row of example chips; the focused field wears the
  `.conic-ring` from `globals.css`. Sending opens `/plan/?q=<ask>` when there is a session, and
  otherwise the `LoginModal` with that same path as its `redirect` prop — the prop is the decoded
  path, taking precedence over `?redirect=`, so nothing inside the ask's own query is decoded twice
  (`utils/safeRedirect.ts`: `safeRedirectTarget` validates, `safeRedirectPath` decodes first).
  Landing with `?redirect=` — the route guard turned someone away — opens that dialog at once. The
  query is read from `window.location` through `useSyncExternalStore`, never `useSearchParams`,
  which would leave the page a shell filled in on hydration instead of prerendered HTML.
- **Trips live in the planner** (TRA-196, ADR 0019): there is no dashboard and no viewer any more.
  `components/planner/v2/TripsList.tsx` is the account's trips, grouped by phase in the order they
  matter in — ongoing, upcoming, past, with a quiet heading and a hairline rule running off it
  rather than a section of its own — and it owns `useTrips` and both dialogs. It appears in two
  places: the trip pane while nothing has been asked yet (the checklist takes its place as soon as
  the conversation starts), and `TripsSheet.tsx`, a glass sheet from the pane's "Your trips".
  `components/ui/TripCard.tsx` is the cover photo with a scrim of `--color-bg-primary` brought back
  up over it (so the copy clears 4.5:1 on either theme whatever the photo is), a stretched link on
  the title to `/plan/?trip=<id>` (`after:absolute after:inset-0`) and one `⋯` button above it: a
  real `role="menu"` with Rename and Delete, arrow keys, Escape, focus back on the button. Rename
  is offered only on an upcoming trip, because core_api refuses the write on the other two; Delete
  is offered on all three, because it is allowed in all three. Both dialogs are modal
  (`aria-modal`, Tab trapped, Escape, focus returned): `RenameTripDialog.tsx` (one field, the only
  thing about a saved trip that is typed rather than planned) and `ConfirmDelete.tsx` (Cancel
  focused, so Enter never deletes by momentum). Deleting collapses the card for 300 ms before
  `useTrips.remove` drops it, and a refusal puts it back and says so in the still-open dialog.
  A trip wears a pill only when it is happening now or is over; "coming up" is what most of them
  are and needs no label.
- **One dialog contract** (TRA-193): `hooks/useDialog.ts` is what `aria-modal` promises — the focus
  moves in when the dialog opens (to `initialFocus`, or to the dialog element, which then needs
  `tabIndex={-1}`), Tab and Shift+Tab cycle inside it, Escape asks to close and the focus goes back
  to whatever opened it; `lockScroll` freezes the page behind a dialog tall enough to scroll.
  `onEscape: null` refuses Escape, which is what an action already in flight needs (`ConfirmDelete`
  while the DELETE is on its way). `LoginModal`, `TripEditSheet` and `ConfirmDelete` all use it —
  a new modal uses it too rather than writing a fourth trap. All three sit on the same surface,
  `bg-glass-bg backdrop-blur-xl border-glass-border` over the aurora, never an opaque card. The
  sign-in dialog adds its own `h2` ("Sign in to plan") as the label, the orbit `Mark` from
  `Logo.tsx` and the landing's `.conic-ring` around its one action.
- `/dashboard/` and `/trip/?id=` are **redirects** kept for old links (TRA-196):
  `app/(app)/dashboard/page.tsx` replaces the URL with `/plan/`, and `app/(app)/trip/TripRedirect.tsx`
  with `/plan/?trip=<uuid>` when the id is a trip id. Sign-in lands on `/plan/` too, and the account
  menu's "Your trips" links there. Never a `/plan/[id]` route: the export cannot serve per-user ids
  (ADR 0011). Links to a trip are `/plan/?trip=${encodeURIComponent(id)}`.
- The planner is `/plan/` (`app/(app)/plan/`, optionally `?q=<prompt>` from the landing's
  `AskField` or `?trip=<uuid>` for a saved trip), the same static-shell + client-page pattern: `PlannerClientPage.tsx` wires
  `usePlanner` to `components/planner/v2/` (layout A from the TRA-136 mockups: `PlannerLayout`
  with three desktop columns — chat ≈ 30 %, trip panel ≈ 40 %, map ≈ 30 % — and the same three as
  mobile tabs, `ChatColumn` with `QuickReplies`, `OptionCarousel` and `OptionCard`, `TripPanel`
  with `BriefChecklist`, `RouteStrip`, `StayCard`, `DayStrip`, `TripOverview`, `DayCard`,
  `WarningBadge` and the
  `AlternativesSheet` behind every "Change", `ActivityDetail` over the day, `TripMap` in the
  third column). The **"Change" sheet asks twice over** (TRA-184): it auto-asks on opening
  (TRA-160), a box above the list searches for what the traveller types instead ("a thermal bath")
  and "More options" pages. Both go through `usePlanner.askAlternatives(slot, { guidance, more })`,
  which writes the ask in the reader's language (`alternatives.askMessage` /
  `askMessageGuided`, `Alternatives for day {day} · {part}: {guidance}` — the form
  `ai_api`'s `ALTERNATIVES_ASK` reads) and sends `exclude_card_ids`: the ids of the group on
  screen when `more`, `[]` otherwise. A guided ask dispatches `group_cleared` so the list starts
  over ("Finding alternatives…"); a plain "More options" keeps the cards and puts the spinner
  under them, because an `options` event whose `group_id` the reducer already knows **appends** the
  cards it does not have and adds no second bubble to the transcript. The group a slot's sheet
  shows is `groupForSlot` (matched on the slot, not the id, so the recorded session's own ids work
  too); the stay's pseudo-slot keeps `askStayMessage` and gets no box.
  The **trip overview** is the default view (TRA-177): whenever an itinerary exists
  and no day is selected, `TripPanel` renders `TripOverview` in the day `tabpanel` — the city's
  photo and its `intro` in the reader's language with an `en` fallback (`PlannerCity`, TRA-182,
  credited to Wikivoyage), a mosaic of up to six of the itinerary's own photos, and the simplified
  list of days, each row opening its day. There is no whole-trip map: `PlannerLayout`'s `map` slot
  is `ReactNode | null` and the overview passes `null`, so the trip pane spans both columns
  (`lg:grid-cols-[minmax(0,3fr)_minmax(0,7fr)]`) and the mobile tablist offers Chat and Trip alone
  (an active Map tab falls back to Trip while rendering). Below the overview the
  itinerary is browsed **one day at a time** (TRA-176): `DayStrip` is a horizontal tablist of a
  leading "Whole trip" chip and one chip per day (date, forecast, how many experiences; arrows,
  Home/End, the selected chip kept in sight by
  scrolling the strip itself — never `scrollIntoView`, which would drag the panel's own scroller) over
  a single `DayCard` rendered `static` — no toggle, always open — and `TripMap`
  maps that same day. The selected day is state of
  `PlannerClientPage` (`hooks/useSelectedDay.ts`), because the `panel` and the `map` slot of
  `PlannerLayout` both follow it; it is `number | null`, starts at `null` (the overview) and falls
  back to the overview whenever the day it points at is not in the itinerary — which is what makes
  a new trip, and a regenerated shorter one, open on the overview — and is not persisted. The
  destination's `PlannerCity` is resolved once by `findCity` (`hooks/usePlannerCities.ts`), which
  also gives the map its `centre`. Day dates come from `src/utils/tripDates.ts`.
  The **map** (TRA-147, ADR 0016) is MapLibre GL over OpenFreeMap's keyless tiles: `mapStops.ts`
  is pure (`toMapStops(itinerary, selectedDay)` → the stay as an unnumbered "H" pin then the day's
  located cards numbered in slot order, `[]` for the overview's `null`, plus `boundsOf`/`lineOf`),
  `TripMap.tsx` is the region and
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
  is honoured globally). Day dates are `src/utils/tripDates.ts`: the panel, the day strip and
  `services/trips.ts` all date a day through it.
  **On a phone the page itself never scrolls** (TRA-187): `PlannerLayout` is
  `100dvh` tall, not `100vh` (which is the viewport with the browser's toolbars hidden and would
  push the composer under the fold), the panes are the only scrollers and each one says so with
  `overscroll-y-contain` and pads its bottom edge with `env(safe-area-inset-bottom)` — the root
  layout asks for `viewportFit: "cover"`. Every form control is 16 px on a coarse pointer (one
  un-layered rule in `globals.css`, because iOS zooms the page in on a smaller one and never zooms
  back out), the chip rows scroll sideways instead of wrapping, and `e2e/mobile.spec.ts` (390 × 844,
  every config, no backend) holds the whole contract. **"Save trip" writes the draft** (TRA-191):
  `SaveTripButton` renders `useSaveTrip`'s four states in the panel's header — the press, the
  spinner, "Saved" with the way into `/trip/?id=`, or what to do about a failure; a recorded demo
  session, which belongs to nobody, keeps the button out of service and says so in its title. The page knows no city by name (TRA-168):
  `services/planner.ts::listCities` reads `GET /ai/planner/cities`, `hooks/usePlannerCities` loads it
  once, and `ChatColumn` turns it into one "Plan a trip to {city}" starter chip per city
  (`SuggestionChips`, only while the transcript is empty) and the destination hint of `QuickReplies`;
  the i18n copy (`plan.cityStarter`, `quickReplies.destinationPlaceholder`) is the fallback while the
  list loads, when the call fails, or without a backend.
  **A saved trip reopens here** (TRA-196): `?trip=<uuid>` drives `useTrip`, `tripToDraft` rebuilds
  the draft and `usePlanner.hydrate` replaces the state with it; the query stays in the URL and
  "Save trip" puts a newly created trip's id there, so a reload comes back to the same trip. A tab
  whose draft already belongs to that trip keeps it, unsaved edits included. While the trip is on
  its way, missing or refused, the **trip pane** says so (`OpenTripNotice`) — never a blank page,
  and a foreign id reads exactly like a deleted one. A trip whose `phase` is not `upcoming` is
  **read-only**: `PlannerClientPage` derives `lockedPhase` from it (it is not planner state) and
  passes it down, the composer gives way to `LockedNotice`, and Save, "Start over", every "Change"
  and "Remove" and the alternatives sheet are not rendered — `onChange`/`onRemove` are optional on
  `DayCard`, `StayCard` and `ActivityDetail` for exactly that. core_api answers 409 `TRIP_LOCKED`
  to every one of those writes (ADR 0019), so the rule is enforced on both sides.
  **Assistant text is Markdown** (TRA-183): every assistant bubble goes through
  `components/planner/MarkdownContent.tsx` (`react-markdown` + `remark-gfm`, a short tag
  allow-list — headings become bold paragraphs, links open in a new tab in `text-accent` — styling
  on the components map, never a global `.prose`, and **raw HTML is never rendered**: no
  `rehype-raw`); user bubbles stay the plain text they typed.
  **Some cards know no day, and the traveller names it** (TRA-185, ADR 0018): a group with
  `slot === null` and kind experience or restaurant (`found:` ids — the places an answer just
  named, or a search that named no day) is *unplaced*. `OptionCarousel` hands such a group's cards
  the `pickSlot` itinerary, their primary button reads `plan.card.addToTrip` ("Add to trip…") and
  opens `SlotPicker` — an inline popover, never a modal: the itinerary's days as a row of buttons
  (arrows move along it, Escape cancels and the button takes the focus back) over the four parts of
  the day as chips, defaulting to `firstEmptyPart` of the chosen day. A multi-selection group keeps
  one picker in the carousel's footer for the whole batch. The slot travels through
  `usePlanner.select(groupId, cardIds, slot?)` into `action.slot`, and the reducer's optimistic
  `put_activity` uses `group.slot ?? action.slot`: a slot the traveller just chose is **added** to,
  while a single pick in a group that names its own slot replaces what that slot held (the "Change"
  flow). Neighbourhood and hotel groups carry no slot either and need none — they are not a day's
  activities — so they keep "Choose"; `AlternativesSheet` always knows its slot and sends it,
  except for the stay's pseudo-slot (`day: 0`), which names no day at all.
- **No eyebrows** (TRA-193): there is no `SectionLabel` any more, and no `uppercase tracking-*`
  label above a heading anywhere in `src/`. A section says what it holds in its own heading; small
  type is sentence case. What is left of ALL-CAPS in the planner's cards (`DayCard`, `StayCard`,
  `OptionCard`, `ActivityDetail`, `AlternativesSheet`) is card micro-metadata, not eyebrows, and is
  deliberately untouched. The trip viewer's sections sit on `transparent` `Section`s and glass
  `Card`s so the aurora runs under the whole page; `Section`'s `primary`/`secondary` backgrounds
  are unused and a new surface should not reach for them.
- Tests: `renderWithProviders` from `src/test/render.tsx` and the typed builders in
  `src/test/fixtures.ts` (`src/test/fixtures/trip-budapest.ts` when a test needs a whole
  `TripResponse`, `src/test/fixtures/planner-city.ts` when it needs a `PlannerCity`);
  assert on roles/names/`data-*` state and on `en.ts` copy, not on class names.
  Do not mock `Card`/`Section`/`Container`/`next/link` or `lucide-react` icon by icon.
- Playwright, three configs over one `e2e/` folder: `playwright.config.ts` (`just test-e2e`: starts
  `next dev` on :3000, the landing-page smoke suite, for the daily loop), `playwright.static.config.ts`
  (`just test-e2e-static`: `next build` served on :3100, adds `prerender.spec.ts`; CI's `frontend`
  job) and `playwright.stack.config.ts` (`just test-e2e-stack`: the running Compose stack on :8080,
  nothing started, every spec; CI's `e2e-stack` job). `trips.spec.ts` is the signed-in suite: there is no
  seed any more, so it creates the trips it needs through the REST API in `beforeAll` and deletes
  them in `afterAll`. It writes `E2E_TOKEN` (`just dev-token <email>`, which creates the account if
  it is new) and the profile into `localStorage` with `page.addInitScript` before navigating, using
  the keys exported by `services/session.ts`, and skips itself entirely when `E2E_TOKEN` is unset,
  so the other two modes need no backend.
  `planner.spec.ts` signs in the same way, mocks `/api/v1/ai/planner` with the recorded session and
  aborts `**/tiles.openfreemap.org/**`, so the run needs no third party: the pins are DOM added when
  the map object is built, not when tiles arrive. The map needs WebGL 2, so `playwright.config.ts`
  launches Chromium with `--enable-unsafe-swiftshader` and without `WAYLAND_DISPLAY`: VS Code
  forwards that WSLg socket into the devcontainer and it breaks SwiftShader (no WebGL at all,
  see `.devcontainer/README.md`, TRA-180). The spec still checks `hasWebGL` and asserts the
  "map unavailable" fallback where there is none. `mobile.spec.ts` is the phone-viewport suite
  (`test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })`): it runs in
  all three configs, signs the planner in with a fake unsigned JWT and sends no turn, so it needs no
  backend either.

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
