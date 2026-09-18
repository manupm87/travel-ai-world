"use client";

import { useLanguage } from "@/context/LanguageContext";

export interface SuggestionChipsProps {
  onPick: (text: string) => void;
  /** A turn is streaming, or there is no backend: the shortcuts wait. */
  disabled?: boolean;
}

/** Shortcut requests under the composer ("Make it cheaper", ...). */
export function SuggestionChips({ onPick, disabled = false }: SuggestionChipsProps) {
  const { t } = useLanguage();

  return (
    <div className="flex flex-wrap gap-2">
      {t.plan.suggestions.map((suggestion) => (
        <button
          key={suggestion}
          type="button"
          onClick={() => onPick(suggestion)}
          disabled={disabled}
          className="rounded-full border border-border-soft bg-transparent px-3.5 py-1.5 text-[13px] text-text-secondary transition hover:border-accent/40 hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {suggestion}
        </button>
      ))}
    </div>
  );
}
