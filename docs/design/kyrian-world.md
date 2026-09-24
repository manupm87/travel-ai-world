# Kyrian World — the design in one page

The rules every surface of the app follows, so work done months apart still looks like one product.
Tokens live in [`src/frontend/src/app/globals.css`](../../src/frontend/src/app/globals.css); this
page says what they are for. If a change needs a value that is not here, add the token and the line
that explains it.

## The idea

One sentence gets the trip started, so **the field is the memorable thing**: the landing is that
field and nothing else — a question, the box you answer it in, and the button that opens the
planner (`components/landing/AskField.tsx`). Its placeholder types the example asks out one after
another, which is what pays for having no example chips, no feature grid and no testimonials. Everything around it —
the wordmark, the language and theme, the sign-in, the footer's credit — stays quiet. Under the
field Kiri rolls in along a dotted floor, brakes and waits for the traveller to say where; she
looks up when the field takes the focus, thinks while they type and rolls off to the planner when
they send it. That entrance is the page's one orchestrated moment. The background is the only thing that moves on
its own: a slate sky, blue-grey with three soft lights in it — sage top-left, mist blue top-right,
lavender on the horizon — over a faint grid of dots. The one warm thing on the page is **Kiri**, the
pixel-art suitcase who packs the trip with the traveller (below).

## Palette

"Pizarra" (slate), from the final sketch on the design canvas (TRA-234/235). Dark is the default;
light is "Pizarra clara", the same slate washed out.

| Token | Dark | Light | What it is |
|---|---|---|---|
| `--color-bg-primary` | `#0C0F13` | `#F4F6F8` | The page itself |
| `--color-bg-secondary` | `#11151A` | `#ECEFF3` | Panels and sheets |
| `--color-bg-card` | `#161B21` | `#FFFFFF` | Opaque cards |
| `--color-bg-surface` | `#1D232A` | `#E3E8EE` | Bubbles, fields, photo placeholders |
| `--color-text-primary` | `#E6EAEF` | `#121821` | Headings and body — **and the action** (15.9:1 / 16.5:1) |
| `--color-text-secondary` | `#98A2AE` | `#4B5663` | Supporting text and metadata (7.4:1 / 6.9:1) |
| `--color-accent` | `#8FB3A6` | `#47705F` | Sage: links, destinations, Kiri on the map, selection (8.4:1 / 5.2:1) |
| `--color-action` / `--color-on-action` | text / page | ink / page | The primary action: the text colour as a fill |
| `--color-warning` (= `--color-gold`) | `#D6B48C` | `#8A5A2B` | Warnings only (9.8:1 / 5.4:1) |
| `--color-purple` | `#A497C8` | `#62558F` | Lavender, the third light (charts in the admin) |
| `--aurora-1/2/3` | sage, mist `#7D97C4`, lavender at 22 / 20 / 15 % | fainter | The three lights of the background |
| `--aurora-dots` | 4.5 % | 5.5 % | The dotted paper under them, one dot every 22 px |
| `--glass-bg` / `--glass-border` | translucent card | translucent white | Surfaces the sky shows through |
| `--color-sticker-*` | fragile `#D9B98F`, overweight `#D08C73`, book ahead `#9DBDB0` | same | Kiri's warning stickers, with `--color-sticker-ink` text |
| `--kiri-*` | clay `#C8876E`, light `#DDA58F`, dark `#9C6250`, outline `#24160F`, cream `#E9DED3` … | same | Kiri, the only warm colour in the interface |

**The action is not a colour.** A primary button is `bg-action text-on-action` — white on the slate,
ink on the light one — and `hover:bg-action-hover`. Sage is never a button fill with white text on
it (it does not clear 4.5:1); it is for links, what is selected and where you are going.

Use the tokens (`bg-bg-card`, `text-text-secondary`, `border-glass-border`, `bg-action`), never a
palette literal like `text-red-400` or a raw hex in a component.

## Type

Outfit for headings (300–500), Plus Jakarta Sans for text and controls, and **Pixelify Sans only for
what Kiri says** — her name tag and her one-liners (`font-pixel`, `--font-pixel`), never for the
model's answer, which stays in the body font. All three are loaded in `app/layout.tsx`.

- Headings: weight 300–400, tracking `-0.03em`, **sentence case**. Large and light beats bold and
  small; the global `h1…h6` rule already sets weight and tracking.
- Body: 15–17 px, line length under 80 characters.
- **Nothing on the traveller's side is under 12 px** (TRA-243): metadata and captions 12–13 px,
  secondary text 14 px, the chat 15 px. Small monitors read the canvas's 10–11 px as a blur. The
  admin console keeps its density.
- No ALL-CAPS tracked labels above headings, no "WORD — fragment" eyebrows, no monospace for small
  data labels, no numbered `01 / 02 / 03` markers unless the content really is a sequence.
- The wordmark is "Kyrian World" in Outfit 500, sentence case, beside **the K of the route**
  (`components/layout/Logo.tsx`): a solid stem and leg in the text colour, the arm drawn as a dotted
  route that reaches a sage dot. It is never translated.

## Kiri

A suitcase that has already been everywhere: she packs the trip with the traveller and keeps a
sticker from every one. `components/kiri/Kiri.tsx` draws her from `frames.ts` — 16 × 18 pixel art
(16 × 26 with the handle out), transcribed from the canvas, always at a **whole** scale (1 = 16 px,
2 = the chat, 4 = a phone) with `shape-rendering: crispEdges`. One state per moment of the trip:
`idle` (waiting on the landing), `blink`, `look` (the field took focus), `thinking` (typing, making
the list), `searching` (looking in the wardrobe), `dragging` (rolling in), `handle` (braking,
setting off to the planner), `happy` (suitcase closed, boarding pass), `lost` (lost luggage),
`asleep` (trips that are over), `stickers` (your trips). She is decoration (`aria-hidden`) unless
given a `label`.

## Motion

One orchestrated moment per page; everything else answers something the reader did.

- **The sky** (`components/layout/Aurora.tsx`) drifts on 28 s and 40 s loops. It is
  `fixed inset-0 -z-10`, `pointer-events-none` and `aria-hidden`, so it never shifts the layout,
  never takes a click and never reaches a screen reader. Transform and opacity only.
- **Entrances** stay under 600 ms and happen once, on load. Per-section fade-ups as you scroll are
  the generated-page default: don't.
- **Answers to an action** — a sheet sliding in, a card collapsing after a confirm, a button
  becoming a spinner — are welcome, because they show what changed. A focused field wears the
  conic ring (sage → mist → lavender) turning slowly around its border: the `.conic-ring` class
  in `globals.css` — one gradient masked down to the 1 px of itself that shows, so the glass
  underneath keeps letting the aurora through — with `animate-ring-spin` over the registered
  `--angle`. Idle, it is a quiet 1 px `--glass-border`.
- Keyframes live in `globals.css` under `@theme` as `--animate-*`, next to the existing ones, and
  are documented in the comment block above them. `prefers-reduced-motion` is honoured once,
  globally: no component adds its own guard. The one exception is motion made of state rather than
  CSS — the landing's typed placeholder (`hooks/useTypewriter.ts`), which reads the media query
  itself and simply shows the first ask in full.
- CSS first. `motion/react` is allowed only for exit animations (`AnimatePresence`). No GSAP, no
  three.js, no Lottie.

## Kiri's answer

A planner turn is packing a suitcase, and says so: open the suitcase, make the list, look in the
wardrobe, fold and fit, weigh it, zip it up. While it streams, Kiri's face changes with the step
and a bar of six fills; when it ends the suitcase is closed "in 9 s" and becomes a boarding pass —
from where to where, the dates, the travellers, the days and the stops, and on the stub Kiri and
"Gate: day 1". A question Kiri still has is a luggage tag with "To decide" dashed where the answer
goes. A warning is a sticker stuck on at a slight angle, in the sticker colours. A failure is lost
luggage, with Kiri lost and one way on: retry. Only Kiri's own words — her name tag, the gate —
are in Pixelify; the model's answer is plain body text, and the traveller's message a bubble.

## Trips in the planner

A saved trip is a planner draft that was written down, so it is read and changed where it was
planned: `/plan/`. There is no viewer.

**The home.** Signing in lands on `/dashboard/`, "Your trips" (TRA-199). It is two things and no
more, in the order they are wanted: the landing's own field, centred under a quiet question —
"Where next?" — and under it the same list of trips the planner keeps, with "New trip" beside its
heading. A returning traveller arrives with one of two intentions, open the trip they have or start
the next one, and the page answers both without a tab, a toggle or an empty workspace in between.
The field is the landing's, exactly: the same placeholder typing itself, the same conic ring, the
same fade on the way out, so nothing has to be learnt twice. Sending it opens the planner with the
ask; a card opens the planner with the trip. The page decides nothing about what can be changed —
it links, and the planner applies the rule below.

**The list.** It lives on the home and nowhere else (TRA-201). The planner used to carry a second
copy of it — in the trip pane until the first word was said, behind a sheet after that — and a
workspace that lists the trips you are not planning is a workspace arguing with itself: the pane
now holds the one trip the planner was opened with, and says so quietly while it is still empty
("Your trip takes shape here"). The way to the others is the header's pill, which is always the
other place: the planner from the home, the trips from everywhere else. The list itself is grouped
by what is happening now, what is coming and what has already happened — that order, because that
is the order they matter in — and a group is a line across the list rather than a section of its
own: a quiet heading with a hairline rule running off it. The cards are photographs you can open,
the trip's own cover under a scrim of the page's background so the title clears 4.5:1 whatever the
photo is. The list settles in once, 40 ms apart.

**The pill.** Only a trip that is happening now, or one that is over, wears one — "On now" in
amber, "Over" in glass. Coming up is what most trips are and needs no label; the heading above them
already says it, and a pill repeating its own heading is decoration.

**The locked notice.** A trip that has started belongs to the traveller, not to the planner:
`core_api` refuses every change to it, and the page refuses to offer any. The composer is replaced
by two lines and one way on — "This trip is happening now — enjoy it. It can't be changed." /
"This trip is over. It stays here as it was." — on the same glass as every other surface, with a
small lock and no red anywhere. It is not an error and must not look like one. Everything else
stays exactly as it was: the days, the cards, the photos, the map. What is gone is Save, "Start
over", every "Change" and every "Remove" — never disabled, simply not there, because a control
that can never be pressed is an explanation nobody asked for.

## Admin console

`/admin/` is a tool, not a page to admire (TRA-222), so it bends three rules on purpose and keeps
the rest. It is **dense**: 14 px body, tables with 8 px rows, no max width, a 240 px sidebar that
stays put while the content scrolls — and no aurora, the plain `--color-bg-primary`, because
weather behind a table is noise. It is the one place with **monospace**: JetBrains Mono
(`--font-mono`, `font-mono`) for ids, subjects, model names and JSON, nowhere else and never for
labels. Numbers are right-aligned in `tabular-nums` and go through `useFormatters()`
(`formatNumber`, `formatMs`, `formatUsd`, `formatPercent`). Its charts are hand-drawn SVG in four
colours, each with one meaning: **`--color-accent`** turns that answered, **`--color-error`** turns
that failed, **`--color-text-muted`** turns the traveller cancelled, **`--color-gold`** output
tokens. Tokens get their own panel under the bars rather than a second y-axis — two scales on one
plot read as a correlation that is not there. Text never wears a series colour; a status is a
dot beside a word (`Pill`), never colour alone, and every chart has a legend, a tooltip that
keyboard focus opens too, and an `sr-only` table with the same numbers.

The **turn inspector** (`/admin/turn/?id=`, TRA-228) follows the boards "Chat en modo admin" and
"Admin en móvil" in structure, with today's tokens rather than their palettes and without the
mascot. Left, what the traveller saw, with four numbered marks (gold-ringed buttons) that lead to
what explains them; right, "What is not seen". Its waterfall paints each step by kind, one token
per kind: **`--color-purple`** a model call, **`--color-success`** a city-kb search,
**`--color-accent`** an external service, **`--color-text-muted`** a code step; a step that warned
gets a **`--color-gold`** outline and a failed one a **`--color-error`** outline, next to a warning
icon so the colour is never alone. The steps are grouped under the five phases, named after packing
a suitcase:

| Phase id | English | Spanish |
|---|---|---|
| `open` | Open the suitcase | Abrir la maleta |
| `wardrobe` | Look in the wardrobe | Mirar en el armario |
| `fold` | Fold and fit | Doblar y encajar |
| `weigh` | Weigh the suitcase | Pesar la maleta |
| `zip` | Zip it up | Cerrar la cremallera |

Below `lg` the right side is a bottom sheet (collapsed to its title and the action, 85dvh open)
with four figures and the tabs Trace / city-kb / Model / Events; it scrolls inside itself, never
the page sideways.

## Copy

Sentence case, plain verbs, the reader's perspective. A button says what happens ("Plan it",
"Delete trip"), and the same action keeps that name through the whole flow. An empty screen invites
an action; an error says what happened and what to do, and does not apologise. Never "Unlock",
"Discover", "Seamless", "Powered by AI", a "→" glued to a button, or meta strings joined with
middle dots. Every visible string, `alt` and `aria-label` goes through i18n (en + es).

## Dialogs

Every modal keeps one contract, and it lives in `src/frontend/src/hooks/useDialog.ts`:
`role="dialog" aria-modal="true"`, labelled by its own heading, the focus moving in on open, Tab
trapped inside, Escape closing it and the focus going back to whatever opened it. Sign-in, the
trip edit sheet and the delete confirmation share it; a fourth dialog uses it rather than writing
its own trap. They share a surface too — `bg-glass-bg backdrop-blur-xl` inside a `--glass-border`
hairline, glass over the aurora and never an opaque card — and a destructive dialog
opens with Cancel focused so Enter never deletes by momentum. A dialog that has already started
its request stops answering Escape: closing it would hide the fact, not call it back.

## What the browser paints

Two things the CSS has to say out loud, or the theme stops at the edge of our own markup:

- `color-scheme` (`dark` on `:root`, `light` on `[data-theme="light"]`) — without it the native
  date picker, the select's list, the scrollbars and the caret all draw themselves light on the
  dusk sky.
- Nothing that spans the page paints its own background. The footer is transparent, the trip
  viewer's sections are `variant="transparent"` with glass cards, and the sticky filter row is
  `bg-glass-bg backdrop-blur-xl`. An opaque band cuts the amber horizon off in a straight line,
  which is exactly what it looks like.

The aurora belongs to a layout, never to a page: `(marketing)/layout.tsx` mounts it directly and
`(app)/layout.tsx` through `components/layout/AppAurora.tsx`, which stands aside on `/plan/` —
the planner is a workspace that paints its own panes, and weather behind a map is weather in the
wrong room.

## Labels

A control gets a label in sentence case. A section gets a heading. Nothing gets both an eyebrow
and a heading that say the same thing — `SectionLabel` is gone and is not coming back. Where the
bar is a phone wide, an action may shorten its visible text ("Planner") as long as its accessible
name stays the whole action ("Open the planner"); it never wraps to two lines.

## The floor, on every surface

Works down to 390 px with a 16 px gutter and no horizontal scroll · visible `focus-visible` ring on
every control (`ring-accent/50`) · a label or accessible name on every control · text contrast
≥ 4.5:1 in both themes · no layout shift from the background.
