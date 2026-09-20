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
the wordmark, the sign-in, the footer — stays quiet. The background is the only thing that moves on
its own: a dusk horizon, ink at the top, indigo and violet lights drifting through it, a warm amber
band where the sky meets the ground.

## Palette

Dark is the default. Light is the same sky at dawn.

| Token | Dark | Light | What it is |
|---|---|---|---|
| `--color-bg-primary` | `#07070E` | `#F7F6FB` | Ink / paper: the page itself |
| `--color-bg-secondary` | `#10102A` | `#EFEDF8` | Dusk: the second surface |
| `--color-bg-card` | `#15152E` | `#FFFFFF` | Opaque cards |
| `--color-text-primary` | `#F3F1FF` | `#12122A` | Body and headings |
| `--color-text-secondary` | `#9A9ABF` | `#4A4A6A` | Supporting text (≥ 4.5:1 on the page) |
| `--color-accent` | `#4F6EF7` | `#4F6EF7` | Indigo: the action, kept from the planner |
| `--color-purple` | `#8B5CF6` | `#7C3AED` | Violet: the second light |
| `--color-gold` | `#F5A623` | `#8A5400` | Amber: the horizon, and warm accents |
| `--aurora-1/2/3` | — | a third of the opacity | The three lights of the background layer |
| `--glass-bg` / `--glass-border` | translucent dusk | translucent paper | Surfaces the aurora shows through |
| `--shadow-field-glow` | indigo, soft, low | the same, weaker | The lift under the field and the primary action |

Use the tokens (`bg-bg-card`, `text-text-secondary`, `border-glass-border`, `shadow-field-glow`),
never a palette literal like `text-red-400` or a raw `rgba(79,110,247,…)`.

Amber is two different values on purpose: on ink it can stay bright (`#F5A623`), on paper it has to
go down to `#8A5400` to clear 4.5:1 as text (5.8:1 on `#F7F6FB`; `#D97706` is 2.4:1 and `#B26A00`
3.9:1, both too light). Where amber is only a glow, a band of the aurora or a background, use the
`--aurora-3` / opacity forms rather than the text token.

## Type

Outfit for headings, Plus Jakarta Sans for body — both already loaded in `app/layout.tsx`.

- Headings: weight 300–400, tracking `-0.03em`, **sentence case**. Large and light beats bold and
  small; the global `h1…h6` rule already sets weight and tracking.
- Body: 15–17 px, line length under 80 characters.
- No ALL-CAPS tracked labels above headings, no "WORD — fragment" eyebrows, no monospace for small
  data labels, no numbered `01 / 02 / 03` markers unless the content really is a sequence.
- The wordmark is "Kyrian World" in Outfit 500, sentence case, beside the orbit mark
  (`components/layout/Logo.tsx`). It is never translated.

## Motion

One orchestrated moment per page; everything else answers something the reader did.

- **The aurora** (`components/layout/Aurora.tsx`) drifts on 28 s and 40 s loops. It is
  `fixed inset-0 -z-10`, `pointer-events-none` and `aria-hidden`, so it never shifts the layout,
  never takes a click and never reaches a screen reader. Transform and opacity only.
- **Entrances** stay under 600 ms and happen once, on load. Per-section fade-ups as you scroll are
  the generated-page default: don't.
- **Answers to an action** — a sheet sliding in, a card collapsing after a confirm, a button
  becoming a spinner — are welcome, because they show what changed. A focused field wears the
  conic ring (indigo → violet → amber) turning slowly around its border: the `.conic-ring` class
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

## Trips in the planner

A saved trip is a planner draft that was written down, so it is read and changed where it was
planned: `/plan/`. There is no dashboard and no viewer.

**The list.** The trip pane holds the account's trips while nothing has been asked yet; after that
it is one press away, as a glass sheet over the workspace. It is grouped by what is happening now,
what is coming and what has already happened — that order, because that is the order they matter in
— and a group is a line across the list rather than a section of its own: a quiet heading with a
hairline rule running off it. The cards are photographs you can open, the trip's own cover under a
scrim of the page's background so the title clears 4.5:1 whatever the photo is. The list settles in
once, 40 ms apart.

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
