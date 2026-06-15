# Dashboard Chat Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor `frontend/src/components/ui/PlannerCard.tsx` into a polished prompt-entry card per the approved spec at `docs/superpowers/specs/2026-05-25-dashboard-chat-polish-design.md`. Same component used on both landing and dashboard.

**Architecture:** Three concerns get touched in two commits. First, the `planner` i18n contract is updated (types + en + es) — old form-field keys are dropped, new chat-entry keys are added. Second, the component and its test file are rewritten together TDD-style: new tests are written first (fail against the existing component), then the component is rewritten to make them pass. Streaming behavior (`streamChat` + SSE), the inline message stream, and the `transparent` prop are preserved.

**Tech Stack:** Next.js 16 (App Router, static export), React 19, TypeScript 5, Tailwind v4 (CSS-property-based tokens), `lucide-react` icons, Vitest + `@testing-library/react`. All commands run from `frontend/`.

**Reading order:** spec first (`docs/superpowers/specs/2026-05-25-dashboard-chat-polish-design.md`), then this plan. The spec is the source of truth for what; this plan covers how.

---

## File structure

| File | Action | Responsibility |
| --- | --- | --- |
| `frontend/src/i18n/types.ts` | Modify | Update `Translations.planner` shape; drop unused `StyleOption` interface |
| `frontend/src/i18n/index.ts` | Modify | Drop the `StyleOption` re-export |
| `frontend/src/i18n/en.ts` | Modify | Drop old planner keys; add new chat-entry keys + 4 example seeds |
| `frontend/src/i18n/es.ts` | Modify | Same, in Spanish |
| `frontend/src/components/ui/PlannerCard.test.tsx` | Modify (full rewrite) | Test the new entry-card structure and behavior |
| `frontend/src/components/ui/PlannerCard.tsx` | Modify (full rewrite of JSX + handlers) | Polished entry card; preserves streaming + inline messages |

No new files. No file renames. No other files change.

---

## Task 1: Update the i18n contract and translations

**Files:**

- Modify: `frontend/src/i18n/types.ts`
- Modify: `frontend/src/i18n/index.ts`
- Modify: `frontend/src/i18n/en.ts`
- Modify: `frontend/src/i18n/es.ts`

### Steps

- [ ] **Step 1: Verify no external callers of the keys we're about to remove**

Run (from repo root):

```bash
grep -rn "p\.destination\|p\.dates\|p\.budget\|p\.travelers\|p\.travelStyle\|p\.styles\|p\.generate\|p\.comingSoon" frontend/src
grep -rn "StyleOption" frontend/src
```

Expected output:

- First grep: no matches.
- Second grep: only matches inside `frontend/src/i18n/types.ts` (the interface itself + the `styles: StyleOption[]` field) and `frontend/src/i18n/index.ts` (re-export).

If any other file matches, stop and reconcile before proceeding.

- [ ] **Step 2: Update the `Translations.planner` shape and drop `StyleOption`**

Edit `frontend/src/i18n/types.ts`.

Delete the `StyleOption` interface (the entire block starting at `export interface StyleOption {` and ending with the matching `}`).

Replace the `planner: { ... }` block with:

```ts
  planner: {
    label: string;
    title: string;
    placeholder: string;
    send: string;
    sendHint: string;
    examplesLabel: string;
    examples: { emoji: string; label: string; prompt: string }[];
    errorFallback: string;
  };
```

- [ ] **Step 3: Drop the `StyleOption` re-export**

Edit `frontend/src/i18n/index.ts`. Change the line:

```ts
export type { StyleOption, Step, FeatureItem, Stat, Testimonial } from "./types";
```

to:

```ts
export type { Step, FeatureItem, Stat, Testimonial } from "./types";
```

- [ ] **Step 4: Update English translations**

Edit `frontend/src/i18n/en.ts`. Replace the entire `planner: { ... }` block (currently lines ~60–84) with:

```ts
  planner: {
    label: "Plan Your Trip",
    title: "Tell the AI where you want to go",
    placeholder:
      "A 7-day trip to Lisbon in October for a couple, mid-budget…",
    send: "Send",
    sendHint: "↵ Send · ⇧↵ Newline",
    examplesLabel: "Try one of these",
    examples: [
      {
        emoji: "🇵🇹",
        label: "Weekend in Lisbon",
        prompt:
          "Plan a 3-day weekend in Lisbon for two, focused on food and architecture.",
      },
      {
        emoji: "🇯🇵",
        label: "10 days in Japan",
        prompt:
          "10 days in Japan in spring: Tokyo, Kyoto, and one off-the-beaten-path stop.",
      },
      {
        emoji: "👨‍👩‍👧",
        label: "Family Madrid",
        prompt:
          "A 4-day family trip to Madrid with two kids (8 and 11), low-walking days preferred.",
      },
      {
        emoji: "🏔",
        label: "Adventure in Patagonia",
        prompt:
          "2-week adventure trip in Patagonia, hiking and outdoors, late November.",
      },
    ],
    errorFallback:
      "Sorry, I couldn't process your request. Please try again.",
  },
```

- [ ] **Step 5: Update Spanish translations**

Edit `frontend/src/i18n/es.ts`. Replace the entire `planner: { ... }` block (currently lines ~60–84) with:

```ts
  planner: {
    label: "Planifica tu viaje",
    title: "Dile a la IA adónde quieres ir",
    placeholder:
      "Un viaje de 7 días a Lisboa en octubre para una pareja, presupuesto medio…",
    send: "Enviar",
    sendHint: "↵ Enviar · ⇧↵ Salto de línea",
    examplesLabel: "Prueba con una de estas",
    examples: [
      {
        emoji: "🇵🇹",
        label: "Fin de semana en Lisboa",
        prompt:
          "Planifica un fin de semana de 3 días en Lisboa para dos, centrado en gastronomía y arquitectura.",
      },
      {
        emoji: "🇯🇵",
        label: "10 días en Japón",
        prompt:
          "10 días en Japón en primavera: Tokio, Kioto y una parada fuera de los circuitos clásicos.",
      },
      {
        emoji: "👨‍👩‍👧",
        label: "Madrid en familia",
        prompt:
          "Un viaje de 4 días a Madrid en familia con dos niños (8 y 11), preferimos días con poca caminata.",
      },
      {
        emoji: "🏔",
        label: "Aventura en la Patagonia",
        prompt:
          "Viaje de aventura de 2 semanas por la Patagonia, senderismo y aire libre, a finales de noviembre.",
      },
    ],
    errorFallback:
      "Lo siento, no pude procesar tu solicitud. Inténtalo de nuevo.",
  },
```

- [ ] **Step 6: Type-check the i18n changes**

Run from `frontend/`:

```bash
npx tsc --noEmit
```

Expected: errors only in `src/components/ui/PlannerCard.test.tsx` and possibly in `src/components/ui/PlannerCard.tsx` — both reference the old i18n shape. If errors appear elsewhere, stop and reconcile.

If the only errors are in those two files, that's expected. The next task rewrites both.

- [ ] **Step 7: Lint the i18n files**

Run from `frontend/`:

```bash
npx eslint src/i18n
```

Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/i18n/types.ts frontend/src/i18n/index.ts frontend/src/i18n/en.ts frontend/src/i18n/es.ts
git commit -m "$(cat <<'EOF'
refactor(i18n): replace planner form-field keys with chat-entry shape

Drop unused destination/dates/budget/travelers/travelStyle/styles
/generate/comingSoon keys (and the StyleOption type). Add
placeholder, send, sendHint, examplesLabel, examples (length-4
array of {emoji,label,prompt}), and errorFallback. EN + ES both
updated to match the new shape required by the polished
PlannerCard entry card.
EOF
)"
```

---

## Task 2: Rewrite PlannerCard tests, then the component (TDD)

**Files:**

- Modify (full rewrite): `frontend/src/components/ui/PlannerCard.test.tsx`
- Modify (full rewrite of JSX + handlers): `frontend/src/components/ui/PlannerCard.tsx`

### Steps

- [ ] **Step 1: Rewrite the test file with the new expected behavior**

Replace the entire contents of `frontend/src/components/ui/PlannerCard.test.tsx` with:

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import React from "react";
import PlannerCard from "./PlannerCard";

const mockI18n = {
  planner: {
    label: "Plan Your Trip",
    title: "Tell the AI where you want to go",
    placeholder: "A 7-day trip to Lisbon in October for a couple, mid-budget…",
    send: "Send",
    sendHint: "↵ Send · ⇧↵ Newline",
    examplesLabel: "Try one of these",
    examples: [
      { emoji: "🇵🇹", label: "Weekend in Lisbon", prompt: "Plan a weekend in Lisbon" },
      { emoji: "🇯🇵", label: "10 days in Japan", prompt: "10 days in Japan" },
      { emoji: "👨‍👩‍👧", label: "Family Madrid", prompt: "Family trip to Madrid" },
      { emoji: "🏔", label: "Adventure in Patagonia", prompt: "2 weeks in Patagonia" },
    ],
    errorFallback: "Sorry, error.",
  },
};

vi.mock("@/context/LanguageContext", () => ({
  useLanguage: () => ({ t: mockI18n }),
}));

vi.mock("@/components/ui/SectionLabel", () => ({
  SectionLabel: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="section-label">{children}</div>
  ),
}));

let apiAvailable = true;
const streamMock = vi.fn();

vi.mock("@/services/api", () => ({
  isApiAvailable: () => apiAvailable,
  streamChat: (...args: unknown[]) => streamMock(...args),
}));

beforeEach(() => {
  apiAvailable = true;
  streamMock.mockReset();
  streamMock.mockImplementation(async function* () {
    yield "Hello back!";
  });
});

const PLACEHOLDER = /A 7-day trip to Lisbon/i;

describe("PlannerCard", () => {
  it("renders eyebrow label and headline from i18n", () => {
    render(<PlannerCard />);
    expect(screen.getByTestId("section-label")).toHaveTextContent("Plan Your Trip");
    expect(
      screen.getByText("Tell the AI where you want to go")
    ).toBeInTheDocument();
  });

  it("renders textarea with the new placeholder", () => {
    render(<PlannerCard />);
    expect(screen.getByPlaceholderText(PLACEHOLDER)).toBeInTheDocument();
  });

  it("renders send button and keyboard hint", () => {
    render(<PlannerCard />);
    expect(screen.getByRole("button", { name: /Send/ })).toBeInTheDocument();
    expect(screen.getByText("↵ Send · ⇧↵ Newline")).toBeInTheDocument();
  });

  it("renders 4 example pills with labels", () => {
    render(<PlannerCard />);
    expect(
      screen.getByRole("button", { name: /Weekend in Lisbon/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /10 days in Japan/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Family Madrid/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Adventure in Patagonia/i })
    ).toBeInTheDocument();
  });

  it("clicking a pill pre-fills the textarea and does not submit", () => {
    render(<PlannerCard />);
    fireEvent.click(screen.getByRole("button", { name: /Weekend in Lisbon/i }));
    const ta = screen.getByPlaceholderText(PLACEHOLDER) as HTMLTextAreaElement;
    expect(ta.value).toBe("Plan a weekend in Lisbon");
    expect(streamMock).not.toHaveBeenCalled();
  });

  it("send button is disabled when input is empty or whitespace", () => {
    render(<PlannerCard />);
    const sendBtn = screen.getByRole("button", { name: /Send/ });
    expect(sendBtn).toBeDisabled();
    fireEvent.change(screen.getByPlaceholderText(PLACEHOLDER), {
      target: { value: "   " },
    });
    expect(sendBtn).toBeDisabled();
  });

  it("Enter submits, Shift+Enter does not", () => {
    render(<PlannerCard />);
    const ta = screen.getByPlaceholderText(PLACEHOLDER);
    fireEvent.change(ta, { target: { value: "go to Paris" } });
    fireEvent.keyDown(ta, { key: "Enter", shiftKey: true });
    expect(streamMock).not.toHaveBeenCalled();
    fireEvent.keyDown(ta, { key: "Enter" });
    expect(streamMock).toHaveBeenCalledTimes(1);
    expect(streamMock).toHaveBeenCalledWith("go to Paris", []);
  });

  it("Cmd+Enter and Ctrl+Enter submit", () => {
    render(<PlannerCard />);
    const ta = screen.getByPlaceholderText(PLACEHOLDER);
    fireEvent.change(ta, { target: { value: "go to Tokyo" } });
    fireEvent.keyDown(ta, { key: "Enter", metaKey: true });
    expect(streamMock).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(ta, { key: "Enter", ctrlKey: true });
    expect(streamMock).toHaveBeenCalledTimes(2);
  });

  it("example pills hide after a message exists", async () => {
    render(<PlannerCard />);
    fireEvent.change(screen.getByPlaceholderText(PLACEHOLDER), {
      target: { value: "go to Lisbon" },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Send/ }));
    });
    expect(
      screen.queryByRole("button", { name: /Weekend in Lisbon/i })
    ).toBeNull();
  });

  it("send button stays disabled when API is unavailable", () => {
    apiAvailable = false;
    render(<PlannerCard />);
    fireEvent.change(screen.getByPlaceholderText(PLACEHOLDER), {
      target: { value: "go to Rome" },
    });
    expect(screen.getByRole("button", { name: /Send/ })).toBeDisabled();
  });

  it("applies transparent section classes when prop set", () => {
    const { container } = render(<PlannerCard transparent />);
    const section = container.querySelector("section");
    expect(section).toHaveClass("bg-transparent");
    expect(section).toHaveClass("py-12");
  });
});
```

- [ ] **Step 2: Run the tests and observe failures**

Run from `frontend/`:

```bash
npx vitest run src/components/ui/PlannerCard.test.tsx
```

Expected: most tests fail. The current component still renders the old static-fallback path / chips and doesn't expose a "Send" button by accessible name. Confirm the failure mode is "queries returned nothing", not a syntax/import error in the test file itself. If imports fail, fix the test before continuing.

- [ ] **Step 3: Rewrite the PlannerCard component**

Replace the entire contents of `frontend/src/components/ui/PlannerCard.tsx` with:

```tsx
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useLanguage } from "@/context/LanguageContext";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { isApiAvailable, streamChat } from "@/services/api";
import { Bot, Loader2, Send, User } from "lucide-react";

interface PlannerCardProps {
  transparent?: boolean;
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

const TEXTAREA_MIN_PX = 72;
const TEXTAREA_MAX_PX = 192;

export default function PlannerCard({ transparent = false }: PlannerCardProps) {
  const { t } = useLanguage();
  const p = t.planner;

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const apiReady = isApiAvailable();
  const canSubmit = input.trim().length > 0 && !isStreaming && apiReady;

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  const autoResize = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, TEXTAREA_MAX_PX) + "px";
  }, []);

  useEffect(() => {
    autoResize();
  }, [input, autoResize]);

  const handleSendToAI = async () => {
    const trimmed = input.trim();
    if (!trimmed || isStreaming || !apiReady) return;

    const userMessage: ChatMessage = { role: "user", content: trimmed };
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsStreaming(true);
    setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

    try {
      const history = messages.map((m) => ({ role: m.role, content: m.content }));
      for await (const chunk of streamChat(trimmed, history)) {
        setMessages((prev) => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          if (last?.role === "assistant") {
            updated[updated.length - 1] = { ...last, content: last.content + chunk };
          }
          return updated;
        });
      }
    } catch (error) {
      setMessages((prev) => {
        const updated = [...prev];
        const last = updated[updated.length - 1];
        if (last?.role === "assistant" && last.content === "") {
          updated[updated.length - 1] = { ...last, content: p.errorFallback };
        }
        return updated;
      });
      console.error("Chat error:", error);
    } finally {
      setIsStreaming(false);
    }
  };

  const handleExampleClick = (prompt: string) => {
    setInput(prompt);
    requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(prompt.length, prompt.length);
      autoResize();
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const isSubmitKey =
      e.key === "Enter" && (!e.shiftKey || e.metaKey || e.ctrlKey);
    if (isSubmitKey) {
      e.preventDefault();
      handleSendToAI();
    }
  };

  const sectionClasses = transparent
    ? "bg-transparent py-12"
    : "bg-bg-secondary py-24";

  return (
    <section id="planner" className={sectionClasses}>
      <div className="max-w-[1440px] w-full mx-auto px-8 lg:px-16 flex flex-col gap-10">
        <div className="flex flex-col gap-4">
          <SectionLabel>{p.label}</SectionLabel>
          <h2 className="text-4xl lg:text-5xl font-medium text-text-primary tracking-[-1px] leading-tight">
            {p.title}
          </h2>
        </div>

        <div className="bg-bg-card border border-border rounded-2xl p-8 lg:p-10 flex flex-col gap-6">
          {messages.length > 0 && (
            <div className="max-h-80 overflow-y-auto space-y-3 px-1">
              {messages.map((msg, i) => (
                <div
                  key={i}
                  className={`flex gap-2.5 ${
                    msg.role === "user" ? "flex-row-reverse" : "flex-row"
                  }`}
                >
                  <div
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${
                      msg.role === "user" ? "bg-accent/20" : "bg-purple/20"
                    }`}
                  >
                    {msg.role === "user" ? (
                      <User size={14} className="text-accent" />
                    ) : (
                      <Bot size={14} className="text-purple" />
                    )}
                  </div>
                  <div
                    className={`max-w-[80%] rounded-xl px-3.5 py-2.5 text-sm leading-relaxed ${
                      msg.role === "user"
                        ? "bg-accent text-white rounded-br-sm"
                        : "bg-bg-surface text-text-primary border border-border rounded-bl-sm"
                    }`}
                  >
                    {msg.content ||
                      (msg.role === "assistant" && isStreaming && (
                        <span className="inline-flex gap-1 items-center">
                          <span className="h-1.5 w-1.5 rounded-full bg-text-secondary animate-pulse [animation-delay:0ms]" />
                          <span className="h-1.5 w-1.5 rounded-full bg-text-secondary animate-pulse [animation-delay:150ms]" />
                          <span className="h-1.5 w-1.5 rounded-full bg-text-secondary animate-pulse [animation-delay:300ms]" />
                        </span>
                      ))}
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>
          )}

          <div className="bg-bg-primary border border-border-soft rounded-xl p-4 focus-within:border-accent/60 focus-within:ring-2 focus-within:ring-accent/10 transition-colors flex flex-col gap-3">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              onInput={autoResize}
              placeholder={p.placeholder}
              disabled={isStreaming}
              rows={3}
              className="w-full bg-transparent text-[15px] text-text-primary placeholder-text-secondary/50 resize-none focus:outline-none disabled:opacity-60"
              style={{
                minHeight: `${TEXTAREA_MIN_PX}px`,
                maxHeight: `${TEXTAREA_MAX_PX}px`,
              }}
            />
            <div className="flex items-center justify-between border-t border-border-soft pt-3">
              <span className="text-[10px] text-text-secondary/60">
                {p.sendHint}
              </span>
              <button
                type="button"
                onClick={handleSendToAI}
                disabled={!canSubmit}
                aria-label={p.send}
                className="flex items-center gap-2 bg-accent hover:bg-accent-hover text-white rounded-lg px-3.5 py-2 text-[13px] font-medium disabled:opacity-40 disabled:cursor-not-allowed transition"
              >
                {isStreaming ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Send size={14} />
                )}
                <span>{p.send}</span>
              </button>
            </div>
          </div>

          {messages.length === 0 && (
            <div className="flex flex-col gap-3">
              <span className="text-[10px] font-medium text-text-secondary tracking-[0.12em] uppercase">
                {p.examplesLabel}
              </span>
              <div className="flex flex-wrap gap-2">
                {p.examples.map((ex) => (
                  <button
                    key={ex.label}
                    type="button"
                    onClick={() => handleExampleClick(ex.prompt)}
                    className="border border-border-soft bg-transparent text-[13px] text-text-secondary hover:text-text-primary hover:border-accent/40 rounded-full px-3.5 py-1.5 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
                  >
                    <span className="mr-1.5">{ex.emoji}</span>
                    {ex.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Run tests — expect all to pass**

Run from `frontend/`:

```bash
npx vitest run src/components/ui/PlannerCard.test.tsx
```

Expected: all 11 tests in the file pass. If any fails, fix the component (or the test if it has a typo) and re-run before continuing.

- [ ] **Step 5: Run the full unit suite to catch collateral damage**

Run from `frontend/`:

```bash
npm run test:unit
```

Expected: all tests pass. The landing-page section tests reference `t.planner.label` / `t.planner.title` (only) so the i18n shape change shouldn't break them. If a test elsewhere fails because it referenced a removed key, fix that test (or restore the key in i18n if the reference is legitimate — but it shouldn't be, per the grep in Task 1 Step 1).

- [ ] **Step 6: Type-check**

Run from `frontend/`:

```bash
npx tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 7: Lint**

Run from `frontend/`:

```bash
npm run lint
```

Expected: zero errors. Address any warnings introduced by the new component (typically about unused imports — confirm `User`, `Bot`, `Loader2`, `Send` are all used).

- [ ] **Step 8: Commit**

```bash
git add frontend/src/components/ui/PlannerCard.tsx frontend/src/components/ui/PlannerCard.test.tsx
git commit -m "$(cat <<'EOF'
refactor(planner): polish PlannerCard into a clean entry card

Single consolidated input with embedded send + keyboard hint,
example prompt pills replacing the fake category chips, full
i18n coverage (no hardcoded Spanish), removed the redundant
"Planificar viaje" CTA, removed the fake action bar (paperclip
+ mic), removed the static-fallback path. Inline streaming
behavior is preserved as-is. Tests fully rewritten against the
new structure (previous suite targeted a long-removed form UI).
EOF
)"
```

---

## Task 3: Manual verification in the browser

This task produces no commit. It's the "looks and feels professional" check the spec is ultimately about.

**Files:** none modified.

### Steps

- [ ] **Step 1: Start the dev server**

Run from `frontend/`:

```bash
npm run dev
```

Wait for `▲ Next.js ...  - Local: http://localhost:3000`. Leave it running for the rest of this task.

- [ ] **Step 2: Verify the landing page hero card**

Open `http://localhost:3000`. Scroll to the `#planner` section (or click the "Plan My Trip" nav link).

Check:

- Section eyebrow reads "Plan Your Trip" (accent color, tracked, uppercase).
- Headline reads "Tell the AI where you want to go".
- Inside the card, the input area has the new placeholder.
- Below the input, "Try one of these" label + four pill buttons (Weekend in Lisbon / 10 days in Japan / Family Madrid / Adventure in Patagonia) with flag emojis.
- No "Vuelos / Hoteles / Restaurantes / Atracciones" chips.
- No fake `📎` paperclip or `🎤` mic button.
- No giant "Planificar viaje" button below the input.
- Send button is inside the input container's bottom row, with the keyboard hint to its left.
- Focusing the textarea: the container gets the accent border + ring.

- [ ] **Step 3: Verify Spanish translations**

Click `ES` in the header. Check:

- Eyebrow: "Planifica tu viaje".
- Headline: "Dile a la IA adónde quieres ir".
- Placeholder, hint, examples label, pill labels all in Spanish.
- Send button label: "Enviar".

Switch back to `EN`.

- [ ] **Step 4: Verify pill click pre-fills the input**

Click any example pill. Verify the textarea is populated with that pill's full prompt, focus has moved to the textarea, caret is at the end. The input does not auto-submit. The send button becomes enabled.

- [ ] **Step 5: Verify auto-resize**

Type a long, multi-line message in the textarea (use Shift+Enter to add newlines). Verify the textarea grows up to the max (about 8 rows), then starts scrolling internally instead of growing further.

- [ ] **Step 6: Verify keyboard hint and submit shortcuts**

With non-empty input:

- Press `Enter` — submits (you should see the user bubble appear; if the backend is reachable, the assistant bubble streams a response; if not, you'll see the error fallback).
- Refresh, type again, press `Shift+Enter` — adds a newline, does not submit.
- Refresh, type again, press `Cmd+Enter` (or `Ctrl+Enter`) — submits.

- [ ] **Step 7: Verify message stream and pill hide**

After a successful submit, verify:

- The conversation appears above the input.
- The four example pills are gone (only the input area remains visible besides the messages).
- Before the first stream chunk lands, the empty assistant bubble shows three pulsing dots (not "Thinking…").
- After streaming, the dots are replaced by the streamed content.

- [ ] **Step 8: Verify the dashboard surface**

Navigate to `http://localhost:3000/dashboard`. (If not authenticated, log in first — backend must be running at the URL set in `frontend/.env.local`.)

Check the entry card at the top:

- Same polished structure as the landing version, but inside the dashboard's transparent section (less vertical padding, no `bg-bg-secondary`).
- Identical pills, placeholder, hint, send button.

- [ ] **Step 9: Stop the dev server**

`Ctrl+C` in the terminal running `npm run dev`.

- [ ] **Step 10: Confirm no uncommitted changes**

```bash
git status -s
```

Expected: no tracked-file changes (only the pre-existing `.claude/settings.json` and `.superpowers/` may remain untracked — those are local artifacts, not part of this work).

---

## Self-review checklist (already performed)

- **Spec coverage:** every section of the spec maps to a task —
  - Component structure (`PlannerCard` rewrite, `transparent` preserved) → Task 2.
  - Visual design (header, input, pills, message stream cleanup, removed elements) → Task 2 component rewrite.
  - i18n keys (types, en, es, removed unused keys) → Task 1.
  - Interaction behavior (auto-resize, keyboard, send button enabled-state, pill click, focus, error, dots indicator) → Task 2 implementation + tests.
  - File-level change list → exactly matches the File Structure table above.
  - Testing (unit) → Task 2 Steps 1, 4, 5.
  - Testing (E2E) → no change, confirmed.
- **Placeholders:** none — every step has either an exact command or a complete code block.
- **Type consistency:** `planner.examples[i]` shape (`{emoji,label,prompt}`) matches across types.ts, en.ts, es.ts, the test mock, and the component's `p.examples.map(...)` call. `errorFallback` is referenced in both the catch path and the i18n files. `sendHint`, `examplesLabel`, `placeholder` all single-source.

The plan is ready to execute.
