# Dashboard chat — polished entry card

**Date:** 2026-05-25
**Status:** Design approved, ready for implementation plan
**Scope:** Visual polish and layout of the dashboard chat entry point (`PlannerCard`)

---

## Summary

Refactor the existing `PlannerCard` component into a polished prompt-entry card. The empty state becomes a single consolidated input with example prompts replacing the current fake category chips. Hardcoded Spanish strings move to i18n. Inline message rendering and streaming behavior are preserved — full chat experience (bubbles, markdown, regenerate, etc.) is deferred to a future dedicated `/plan` route, not in this scope.

The same refactored component is used on both the landing page hero and the user dashboard. The `transparent` prop continues to differentiate the outer section padding/background between the two contexts.

## Goals

- The dashboard chat looks and feels professional: clean hierarchy, no fake/non-functional controls, real example prompts.
- No hardcoded strings in the component — full EN/ES coverage via the existing i18n system.
- Single, unambiguous send path (no redundant CTAs).
- Preserve the existing streaming behavior (`streamChat` + SSE) so the chat remains functional today.

## Non-goals

- Message bubble redesign or markdown rendering — deferred to future `/plan` page.
- Copy / regenerate / edit / retry / abort message actions.
- Conversation persistence across reloads.
- Structured trip output from chat (chat → dashboard trip card pipeline).
- "New chat" UI / conversation list.
- The new `/plan` route itself.
- Landing-page-specific polish beyond what the shared component change brings for free.
- Updating `ideas.pen` to reflect the new design.

## Component structure

Refactor `frontend/src/components/ui/PlannerCard.tsx` in place. One component, used on both landing and dashboard via the existing `transparent` prop:

- `transparent={false}` (default, landing): outer section uses `bg-bg-secondary py-24` (unchanged).
- `transparent={true}` (dashboard): outer section uses `bg-transparent py-12` (unchanged).

The inner card (the polished entry surface) is identical in both contexts.

`frontend/src/components/ui/PlannerCard.test.tsx` is updated to match the new structure.

## Visual design

Top to bottom inside the inner card (`bg-bg-card`, `border-border`, `rounded-2xl`, `p-8 lg:p-10`, `flex flex-col gap-6`):

1. **Header block** — eyebrow + headline:
   - Eyebrow: `text-[11px]` `text-accent` `tracking-[0.16em]` uppercase, weight 500, from `t.planner.label`.
   - Headline: `text-4xl lg:text-5xl` `font-medium` `text-text-primary` `tracking-[-1px]` `leading-tight`, from `t.planner.title`.
   - Stacked, `gap-2`.

2. **Input area** — single rounded container:
   - Container: `bg-bg-primary`, `border border-border-soft`, `rounded-xl`, `p-4`, `focus-within:border-accent/60`, `focus-within:ring-2 focus-within:ring-accent/10`, `transition-colors`.
   - `<textarea>`: auto-resizing (see Interaction). Transparent background, `text-[15px] text-text-primary placeholder-text-secondary/50`, no resize handle, `focus:outline-none`.
   - Bottom row: `flex items-center justify-between border-t border-border-soft pt-3 mt-3`.
     - Left: keyboard hint, `text-[10px] text-text-secondary/60`, from `t.planner.sendHint`.
     - Right: send button — `bg-accent hover:bg-accent-hover text-white rounded-lg px-3.5 py-2 text-[13px] font-medium flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed transition`. Icon is `<Send size={14} />`; replaced with `<Loader2 size={14} className="animate-spin" />` while streaming. Label from `t.planner.send`.

3. **Example prompts row** — only when `messages.length === 0`:
   - Label: small uppercase label, `text-[10px] text-text-secondary tracking-[0.12em] uppercase`, from `t.planner.examplesLabel`.
   - Pills: `flex flex-wrap gap-2`. Each pill: `<button type="button">` with `border border-border-soft bg-transparent text-[13px] text-text-secondary hover:text-text-primary hover:border-accent/40 rounded-full px-3.5 py-1.5 transition`. Pill content: `{emoji} {label}`.
   - 4 pills max, sourced from `t.planner.examples`.

4. **Inline message stream** — only when `messages.length > 0`, rendered between header and input. Current implementation is preserved nearly as-is (bubble structure, user/bot icons, scroll-to-bottom on update). Minor visual cleanup only:
   - Container: `max-h-80 overflow-y-auto space-y-3` (unchanged).
   - Streaming indicator: replace the current "Thinking…" `<Loader2>` + text pill with three pulsing dots inside the empty assistant bubble (tiny CSS-only typing indicator: three spans with staggered `animate-pulse`).
   - No other bubble redesign.

**Removed from the current component:**

- The four hardcoded category chips (Vuelos / Hoteles / Restaurantes / Atracciones).
- The fake action bar with `📎` paperclip and `🎤` mic.
- The redundant giant `Planificar viaje` CTA button at the bottom of the card.
- The hardcoded inline `ESCRIBE TU VIAJE` label.
- The static "coming soon" / `handleStaticSubmit` fallback path. The component now assumes the API is configured for real use. If `isApiAvailable()` returns `false` (e.g. local build without env vars), the send button is rendered permanently disabled regardless of input; no static "✅ ¡Próximamente!" affordance, no toast. Backend is live in this branch, so this path is effectively dead in production.

## i18n keys

All strings live under `planner` in `frontend/src/i18n/en.ts` and `frontend/src/i18n/es.ts`. The `Translations` interface in `frontend/src/i18n/types.ts` is updated accordingly.

| Key | EN | ES |
| --- | --- | --- |
| `planner.label` (existing, kept) | "Plan Your Trip" | "Planifica tu viaje" |
| `planner.title` (existing, kept) | "Tell the AI where you want to go" | "Dile a la IA adónde quieres ir" |
| `planner.placeholder` (new) | "A 7-day trip to Lisbon in October for a couple, mid-budget…" | "Un viaje de 7 días a Lisboa en octubre para una pareja, presupuesto medio…" |
| `planner.send` (new) | "Send" | "Enviar" |
| `planner.sendHint` (new) | "↵ Send · ⇧↵ Newline" | "↵ Enviar · ⇧↵ Salto de línea" |
| `planner.examplesLabel` (new) | "Try one of these" | "Prueba con una de estas" |
| `planner.examples` (new, length-4 array) | see seeds below | translated equivalents |
| `planner.errorFallback` (new) | "Sorry, I couldn't process your request. Please try again." | "Lo siento, no pude procesar tu solicitud. Inténtalo de nuevo." |

`planner.examples[i]` shape: `{ emoji: string; label: string; prompt: string }` — `label` shows on the pill, `prompt` is pre-filled when clicked.

Example seeds (EN):

- `{ emoji: "🇵🇹", label: "Weekend in Lisbon", prompt: "Plan a 3-day weekend in Lisbon for two, focused on food and architecture." }`
- `{ emoji: "🇯🇵", label: "10 days in Japan", prompt: "10 days in Japan in spring: Tokyo, Kyoto, and one off-the-beaten-path stop." }`
- `{ emoji: "👨‍👩‍👧", label: "Family Madrid", prompt: "A 4-day family trip to Madrid with two kids (8 and 11), low-walking days preferred." }`
- `{ emoji: "🏔", label: "Adventure in Patagonia", prompt: "2-week adventure trip in Patagonia, hiking and outdoors, late November." }`

**Removed (unused) keys:** `planner.destination`, `planner.destinationPlaceholder`, `planner.dates`, `planner.datesPlaceholder`, `planner.budget`, `planner.budgetPlaceholder`, `planner.travelers`, `planner.travelersPlaceholder`, `planner.travelStyle`, `planner.styles`, `planner.generate`, `planner.comingSoon`, `planner.comingSoonNote`. Verified unreferenced via grep before deletion.

## Interaction behavior

- **Auto-resize textarea.** Min 3 rows (~72px), max ~8 rows (~192px), then internal scroll. Implementation: in an `onInput` (and on initial mount + on programmatic value changes), set `el.style.height = 'auto'` then `el.style.height = Math.min(el.scrollHeight, MAX_PX) + 'px'`.
- **Keyboard.** `Enter` submits when input is non-empty and not streaming. `Shift+Enter` inserts a newline. `Cmd/Ctrl+Enter` also submits.
- **Send button.** Enabled iff `input.trim().length > 0 && !isStreaming && isApiAvailable()`. Disabled state: 40% opacity, `cursor-not-allowed`. Streaming: icon swaps to spinner, label stays.
- **Example pill click.** Sets `input` to the pill's `prompt`, focuses the textarea, places caret at end, re-runs auto-resize. Does not auto-submit.
- **Pill visibility.** Hidden when `messages.length > 0`. Reappear on a hypothetical "new chat" — no UI for that in this scope.
- **Focus state.** Outer input container gets `focus-within` border + ring as described above. Pills get a default `focus-visible:ring-2 focus-visible:ring-accent/40` for keyboard nav.
- **Error path.** On `streamChat` throw, the trailing empty assistant message is replaced with `t.planner.errorFallback`. `console.error` preserved for debugging. `isStreaming` reset in `finally`.
- **Streaming indicator.** Three pulsing dots (typing indicator) inside the empty assistant bubble before the first chunk; replaced naturally once content streams in.

## File-level change list

- `frontend/src/components/ui/PlannerCard.tsx` — rewrite the JSX inside the inner card and the submit/keyboard handlers; remove fallback static-submit path. Keep `streamChat` integration and message state intact.
- `frontend/src/components/ui/PlannerCard.test.tsx` — rewrite to cover the new structure (see Testing).
- `frontend/src/i18n/en.ts` — remove unused `planner.*` keys, add new ones listed above.
- `frontend/src/i18n/es.ts` — same.
- `frontend/src/i18n/types.ts` — update `Translations.planner` shape.

No other files change. No new files are created. (`frontend/e2e/smoke.spec.ts` doesn't currently assert on the planner card on either surface, so it doesn't need updates for this change.)

## Testing

### Unit (`PlannerCard.test.tsx`)

**Current state:** the existing test file is stale — 4 of 5 tests already fail because they target a long-removed form-based UI (destination/dates/budget/travel-style inputs). It needs a full rewrite either way; this change is a good moment.

The rewritten file mocks `useLanguage` and `streamChat` and covers:

- Renders eyebrow label and headline from i18n.
- Renders the textarea with the new placeholder.
- Renders the send button (icon + label) and keyboard hint.
- Renders 4 example pill buttons with correct labels.
- Clicking a pill pre-fills the textarea, focuses it, and does not auto-submit.
- Send button is disabled when input is empty / whitespace.
- Send button is disabled and shows the spinner while `isStreaming` is true (state simulated by holding the mocked `streamChat` async iterator open).
- `Enter` (without shift) triggers `streamChat`; `Shift+Enter` does not.
- `Cmd+Enter` and `Ctrl+Enter` trigger `streamChat`.
- Example pills are not rendered when at least one message exists (simulated by sending one prompt and letting the mocked stream complete).
- When `isApiAvailable()` returns `false` (module mock), the send button stays disabled regardless of input.
- Removed tests: anything covering the old category chips, the giant CTA, the action bar, or the static-submit fallback.

The test mocks the `planner` i18n shape from `en.ts` (English path only — i18n itself is exercised in landing-section tests and E2E).

### E2E

No changes. The current smoke spec doesn't assert on the planner card, and adding an authenticated dashboard E2E is out of scope.

## Open questions

None — all design decisions resolved during brainstorming. The implementation plan can proceed.
