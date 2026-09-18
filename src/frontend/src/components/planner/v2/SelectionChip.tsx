"use client";

import { Check } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { interpolate } from "@/i18n";

export interface SelectionChipProps {
  titles: string[];
}

/**
 * "Chosen: Belváros": what the user picked in a carousel, echoed in the
 * transcript on the user's side so the conversation reads as a dialogue.
 */
export function SelectionChip({ titles }: SelectionChipProps) {
  const { t } = useLanguage();

  return (
    <div className="flex justify-end">
      <span className="inline-flex max-w-[80%] items-center gap-1.5 rounded-full border border-accent/40 bg-accent/10 px-3 py-1 text-xs text-text-primary">
        <Check size={12} aria-hidden="true" className="shrink-0 text-accent" />
        {interpolate(t.plan.chosen, { titles: titles.join(", ") })}
      </span>
    </div>
  );
}
