"use client";

/** The planner's message composer. */

import type { KeyboardEvent, RefObject } from "react";
import { Loader2, Send } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { cn } from "@/utils/cn";

export const TEXTAREA_MAX_PX = 192;

interface PromptComposerProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  /** Ref owned by the parent (auto-resize + focus from the example pills). */
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  onResize: () => void;
  isStreaming: boolean;
  canSubmit: boolean;
  /** No ai_api configured: explain instead of failing silently. */
  unavailable: boolean;
  /** Overrides the landing card's copy (the planner page asks for a change). */
  placeholder?: string;
  /** Below `lg`, start one line tall with less padding (the planner's chat pane on a phone). */
  compact?: boolean;
}

/** Textarea + send button. Enter sends, Shift+Enter inserts a newline. */
export function PromptComposer({
  value,
  onChange,
  onSubmit,
  textareaRef,
  onResize,
  isStreaming,
  canSubmit,
  unavailable,
  placeholder,
  compact = false,
}: PromptComposerProps) {
  const { t } = useLanguage();
  const p = t.planner;

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    const isSubmitKey = e.key === "Enter" && (!e.shiftKey || e.metaKey || e.ctrlKey);
    if (isSubmitKey) {
      e.preventDefault();
      onSubmit();
    }
  };

  return (
    /* the landing field's look: glass at rest, a spinning conic ring while focused */
    <div className="group relative">
      <span
        aria-hidden="true"
        className="conic-ring pointer-events-none absolute -inset-px rounded-[13px] opacity-0 transition-opacity duration-300 group-focus-within:animate-ring-spin group-focus-within:opacity-100"
      />
      <div
        className={cn(
          "relative flex flex-col gap-3 rounded-xl border border-glass-border bg-glass-bg p-4 backdrop-blur-xl transition-colors group-focus-within:border-transparent",
          compact && "p-3 lg:p-4"
        )}
      >
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          onInput={onResize}
          placeholder={placeholder ?? p.placeholder}
          disabled={isStreaming}
          // the min-height sets the empty height; more `rows` would fight the compact minimum
          rows={1}
          aria-label={p.title}
          className={cn(
            "w-full bg-transparent text-base lg:text-[15px] text-text-primary placeholder-text-secondary/50 resize-none focus:outline-none disabled:opacity-60",
            compact ? "min-h-11 lg:min-h-[72px]" : "min-h-[72px]"
          )}
          style={{ maxHeight: `${TEXTAREA_MAX_PX}px` }}
        />
        <div className="flex items-center justify-between gap-4 border-t border-glass-border pt-3">
          <span className="text-xs text-text-secondary/60">
            {unavailable ? (
              <span role="status">{p.unavailable}</span>
            ) : (
              /* the keyboard hint is noise on a phone; the `unavailable` notice always shows */
              <span className="hidden sm:inline">{p.sendHint}</span>
            )}
          </span>
          <button
            type="button"
            onClick={onSubmit}
            disabled={!canSubmit}
            aria-label={p.send}
            className="flex shrink-0 items-center gap-2 rounded-lg bg-action px-3.5 py-2 text-sm font-medium text-on-action transition hover:bg-action-hover focus-visible:ring-2 focus-visible:ring-accent/50 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-40"
          >
            {isStreaming ? (
              <Loader2 size={14} className="animate-spin" aria-hidden="true" />
            ) : (
              <Send size={14} aria-hidden="true" />
            )}
            <span>{p.send}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
