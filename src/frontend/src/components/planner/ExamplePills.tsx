"use client";

import { useLanguage } from "@/context/LanguageContext";

interface ExamplePillsProps {
  onPick: (prompt: string) => void;
}

/** Suggested prompts, shown until the conversation starts. */
export function ExamplePills({ onPick }: ExamplePillsProps) {
  const { t } = useLanguage();
  const p = t.planner;

  return (
    <div className="flex flex-col gap-3">
      <span className="text-[10px] font-medium text-text-secondary tracking-[0.12em] uppercase">
        {p.examplesLabel}
      </span>
      <div className="flex flex-wrap gap-2">
        {p.examples.map((example) => (
          <button
            key={example.label}
            type="button"
            onClick={() => onPick(example.prompt)}
            className="border border-border-soft bg-transparent text-[13px] text-text-secondary hover:text-text-primary hover:border-accent/40 rounded-full px-3.5 py-1.5 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
          >
            <span className="mr-1.5" aria-hidden="true">
              {example.emoji}
            </span>
            {example.label}
          </button>
        ))}
      </div>
    </div>
  );
}
