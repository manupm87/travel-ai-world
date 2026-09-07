"use client";

import type { KeyboardEvent, RefObject } from "react";
import { Loader2, Send } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";

export const TEXTAREA_MIN_PX = 72;
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
    <div className="bg-bg-primary border border-border-soft rounded-xl p-4 focus-within:border-accent/60 focus-within:ring-2 focus-within:ring-accent/10 transition-colors flex flex-col gap-3">
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        onInput={onResize}
        placeholder={p.placeholder}
        disabled={isStreaming}
        rows={3}
        aria-label={p.title}
        className="w-full bg-transparent text-[15px] text-text-primary placeholder-text-secondary/50 resize-none focus:outline-none disabled:opacity-60"
        style={{ minHeight: `${TEXTAREA_MIN_PX}px`, maxHeight: `${TEXTAREA_MAX_PX}px` }}
      />
      <div className="flex items-center justify-between gap-4 border-t border-border-soft pt-3">
        <span className="text-[10px] text-text-secondary/60">
          {unavailable ? <span role="status">{p.unavailable}</span> : p.sendHint}
        </span>
        <button
          type="button"
          onClick={onSubmit}
          disabled={!canSubmit}
          aria-label={p.send}
          className="flex shrink-0 items-center gap-2 bg-accent hover:bg-accent-hover text-white rounded-lg px-3.5 py-2 text-[13px] font-medium disabled:opacity-40 disabled:cursor-not-allowed transition"
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
  );
}
