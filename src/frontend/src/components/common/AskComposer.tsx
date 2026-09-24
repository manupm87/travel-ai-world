"use client";

import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { Loader2, Send } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { Button } from "@/components/ui/Button";
import { useAutoResizeTextarea } from "@/hooks/useAutoResizeTextarea";
import { useTypewriter } from "@/hooks/useTypewriter";
import { cn } from "@/utils/cn";

/** How long the block fades before the next page takes over. */
const FADE_MS = 250;
/** The field stops growing here and scrolls instead. */
const TEXTAREA_MAX_PX = 200;

export interface AskComposerProps {
  /**
   * The press. It answers with where the reader is going — the composer fades
   * the block out and navigates there — or with `null` when the ask was taken
   * somewhere else (the sign-in dialog), which leaves the field exactly as it
   * was, still holding what was typed.
   */
  onSubmit: (ask: string) => string | null;
  /** Id of the heading that names the field; `label` is the alternative. */
  labelledBy?: string;
  /** The field's accessible name when no heading names it. */
  label?: string;
  /** Takes the focus on mount: for a page whose only purpose is this field. */
  autoFocus?: boolean;
  /** Rendered above the field, inside the block that fades on its way out. */
  children?: ReactNode;
  /** A quiet line beside the button, under a hairline: the cities there are. */
  hint?: ReactNode;
  /** The field took or lost the focus (Kiri looks up, TRA-236). */
  onFocusChange?: (focused: boolean) => void;
  /** What is typed, as it is typed (Kiri notes it down). */
  onAskChange?: (ask: string) => void;
  /**
   * `full` is the landing's field — room to write, the action below it;
   * `compact` the home's one line with a round send button inside (TRA-237).
   */
  variant?: "full" | "compact";
  className?: string;
}

/**
 * The ask: one field, one action, the same gesture wherever it appears.
 *
 * It is the landing's field (`components/landing/AskField.tsx`, which wraps it
 * in everything about signing in) and the signed-in home's (`/dashboard/`),
 * because a reader who has just arrived and a reader who has five trips are
 * asking the same question and should not have to learn two fields.
 *
 * The placeholder types the example asks out one after another
 * (`useTypewriter`, reduced-motion aware), the field grows with what is typed,
 * Enter sends and Shift+Enter breaks the line — the planner's composer
 * contract, so the gesture carries over to the next page — and the focused
 * field wears the conic ring from `globals.css`.
 *
 * Sending fades the whole block out and navigates: the browser cross-fades the
 * two pages where `startViewTransition` exists, and everywhere else the fade
 * runs on its own and the push waits for it.
 */
export function AskComposer({
  onSubmit,
  labelledBy,
  label,
  autoFocus = false,
  children,
  hint,
  onFocusChange,
  onAskChange,
  variant = "full",
  className,
}: AskComposerProps) {
  const { t } = useLanguage();
  const router = useRouter();

  const [ask, setAsk] = useState("");
  const [leaving, setLeaving] = useState(false);

  const { ref: fieldRef, resize } = useAutoResizeTextarea(ask, TEXTAREA_MAX_PX);
  const placeholder = useTypewriter(t.landing.examples);
  const timer = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    []
  );

  const trimmed = ask.trim();
  const canSubmit = trimmed.length > 0 && !leaving;

  const open = (href: string) => {
    setLeaving(true);
    const navigate = () => router.push(href);
    if (typeof document.startViewTransition === "function") {
      document.startViewTransition(navigate);
      return;
    }
    timer.current = window.setTimeout(navigate, FADE_MS);
  };

  const submit = (event?: FormEvent) => {
    event?.preventDefault();
    if (!canSubmit) return;
    const href = onSubmit(trimmed);
    if (href) open(href);
  };

  // Enter sends, Shift+Enter breaks the line.
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Enter" || (event.shiftKey && !event.metaKey && !event.ctrlKey)) return;
    event.preventDefault();
    submit();
  };

  const compact = variant === "compact";
  const sendLabel = leaving ? t.landing.sending : t.landing.send;

  return (
    <div
      data-leaving={leaving}
      className={cn(
        "mx-auto w-full max-w-[45rem] animate-fade-up transition-opacity duration-300",
        leaving && "opacity-0",
        className
      )}
    >
      {children}

      <form onSubmit={submit} className="group relative">
        {/* The conic ring, turning while the field has the focus. */}
        <span
          aria-hidden="true"
          className="conic-ring pointer-events-none absolute -inset-px rounded-[20px] opacity-0 transition-opacity duration-300 group-focus-within:animate-ring-spin group-focus-within:opacity-100"
        />

        <div
          className={cn(
            "relative flex rounded-[19px] border border-glass-border bg-glass-bg shadow-field-glow backdrop-blur-xl transition-colors group-focus-within:border-transparent",
            compact
              ? "items-end gap-2 py-1.5 pr-1.5 pl-4 sm:pl-5"
              : "flex-col gap-3 px-4 pt-4 pb-3.5 sm:px-5 sm:pt-5"
          )}
        >
          <textarea
            ref={fieldRef}
            value={ask}
            onChange={(event) => {
              setAsk(event.target.value);
              onAskChange?.(event.target.value);
            }}
            onFocus={() => onFocusChange?.(true)}
            onBlur={() => onFocusChange?.(false)}
            onInput={resize}
            onKeyDown={onKeyDown}
            rows={1}
            autoComplete="off"
            autoFocus={autoFocus}
            aria-labelledby={labelledBy}
            aria-label={labelledBy ? undefined : label}
            placeholder={placeholder}
            className={cn(
              "block w-full resize-none bg-transparent leading-normal text-text-primary placeholder:text-text-muted focus:outline-none",
              compact
                ? // One line: a long example ends in an ellipsis instead of wrapping under the fold.
                  "min-h-11 py-2.5 text-[17px] placeholder-shown:overflow-hidden placeholder:overflow-hidden placeholder:text-ellipsis placeholder:whitespace-nowrap"
                : "min-h-[3.75rem] text-[17px] sm:text-lg"
            )}
            style={{ maxHeight: `${TEXTAREA_MAX_PX}px` }}
          />
          {compact ? (
            <Button
              type="submit"
              size="sm"
              disabled={!canSubmit}
              aria-busy={leaving}
              aria-label={sendLabel}
              title={sendLabel}
              className="h-11 w-11 shrink-0 rounded-xl p-0 shadow-none disabled:cursor-not-allowed disabled:opacity-50"
            >
              {leaving ? (
                <Loader2 size={17} className="animate-spin" aria-hidden="true" />
              ) : (
                <Send size={17} aria-hidden="true" />
              )}
            </Button>
          ) : (
            <div
              className={cn(
                "flex items-center gap-4",
                hint ? "justify-between border-t border-glass-border pt-3" : "justify-end"
              )}
            >
              {hint && <p className="min-w-0 text-[13px] text-text-muted">{hint}</p>}
              <Button
                type="submit"
                size="sm"
                disabled={!canSubmit}
                aria-busy={leaving}
                className="h-[42px] shrink-0 gap-2 rounded-xl px-[18px] py-0 text-[15px] font-semibold shadow-none disabled:cursor-not-allowed disabled:opacity-50"
              >
                {sendLabel}
                {leaving ? (
                  <Loader2 size={16} className="animate-spin" aria-hidden="true" />
                ) : (
                  <Send size={16} aria-hidden="true" />
                )}
              </Button>
            </div>
          )}
        </div>
      </form>
    </div>
  );
}
