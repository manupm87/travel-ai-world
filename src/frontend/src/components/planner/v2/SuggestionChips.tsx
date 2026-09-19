"use client";

import { useLanguage } from "@/context/LanguageContext";
import { interpolate } from "@/i18n";
import type { PlannerCity } from "@/types/planner";

export interface SuggestionChipsProps {
  onPick: (text: string) => void;
  /** A turn is streaming, or there is no backend: the shortcuts wait. */
  disabled?: boolean;
  /** The cities the planner covers: one "Plan a trip to …" starter each. */
  cities?: PlannerCity[];
  /** Show the city starters (the conversation has not begun). */
  showStarters?: boolean;
}

const chipClass =
  "rounded-full border border-border-soft bg-transparent px-3.5 py-1.5 text-[13px] text-text-secondary transition hover:border-accent/40 hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 disabled:cursor-not-allowed disabled:opacity-50";

/**
 * Shortcut requests under the composer ("Make it cheaper", ...), preceded by
 * one starter per covered city ("Plan a trip to Bologna") while the
 * conversation is empty.
 */
export function SuggestionChips({
  onPick,
  disabled = false,
  cities = [],
  showStarters = false,
}: SuggestionChipsProps) {
  const { t } = useLanguage();
  const starters = showStarters
    ? cities.map((city) => interpolate(t.plan.cityStarter, { city: city.name }))
    : [];

  return (
    <div className="flex flex-wrap gap-2">
      {[...starters, ...t.plan.suggestions].map((suggestion) => (
        <button
          key={suggestion}
          type="button"
          onClick={() => onPick(suggestion)}
          disabled={disabled}
          className={chipClass}
        >
          {suggestion}
        </button>
      ))}
    </div>
  );
}
