# Kyrian World — the design in one page

The rules every surface of the app follows, so work done months apart still looks like one product.
Tokens live in [`src/frontend/src/app/globals.css`](../../src/frontend/src/app/globals.css); this
page says what they are for. If a change needs a value that is not here, add the token and the line
that explains it.

## The idea

One sentence gets the trip started, so **the field is the memorable thing**. Everything around it —
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
| `--color-gold` | `#F5A623` | `#B26A00` | Amber: the horizon, and warm accents |
| `--aurora-1/2/3` | — | a third of the opacity | The three lights of the background layer |
| `--glass-bg` / `--glass-border` | translucent dusk | translucent paper | Surfaces the aurora shows through |
| `--shadow-field-glow` | indigo, soft, low | the same, weaker | The lift under the field and the primary action |

Use the tokens (`bg-bg-card`, `text-text-secondary`, `border-glass-border`, `shadow-field-glow`),
never a palette literal like `text-red-400` or a raw `rgba(79,110,247,…)`.

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
  becoming a spinner — are welcome, because they show what changed.
- Keyframes live in `globals.css` under `@theme` as `--animate-*`, next to the existing ones, and
  are documented in the comment block above them. `prefers-reduced-motion` is honoured once,
  globally: no component adds its own guard.
- CSS first. `motion/react` is allowed only for exit animations (`AnimatePresence`). No GSAP, no
  three.js, no Lottie.

## Copy

Sentence case, plain verbs, the reader's perspective. A button says what happens ("Plan it",
"Delete trip"), and the same action keeps that name through the whole flow. An empty screen invites
an action; an error says what happened and what to do, and does not apologise. Never "Unlock",
"Discover", "Seamless", "Powered by AI", a "→" glued to a button, or meta strings joined with
middle dots. Every visible string, `alt` and `aria-label` goes through i18n (en + es).

## The floor, on every surface

Works down to 390 px with a 16 px gutter and no horizontal scroll · visible `focus-visible` ring on
every control (`ring-accent/50`) · a label or accessible name on every control · text contrast
≥ 4.5:1 in both themes · no layout shift from the background.
