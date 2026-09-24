"use client";

import { RotateCcw } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { Kiri } from "@/components/kiri/Kiri";

export interface LostLuggageProps {
  /** What went wrong, in the reader's language (`t.plan.errors[kind]`). */
  errorText: string;
  /** Sends the failed turn again; without it there is nothing to retry. */
  onRetry?: () => void;
}

/**
 * A turn that failed (TRA-239): "Lost luggage", Kiri lost beside it, what
 * happened, that the trip is as it was, and "Retry" — which sends the same
 * turn again. An alert, so it is read out when it appears.
 */
export function LostLuggage({ errorText, onRetry }: LostLuggageProps) {
  const { t } = useLanguage();
  const p = t.plan.packing.lost;

  return (
    <div
      role="alert"
      className="flex animate-fade-up flex-col gap-3 rounded-2xl border border-glass-border bg-bg-card px-4 py-3.5"
    >
      <div className="flex items-start gap-3">
        <Kiri state="lost" scale={2} />
        <div className="flex min-w-0 flex-col gap-1">
          <p className="text-[14px] font-semibold text-text-primary">{p.title}</p>
          <p className="text-sm leading-snug text-text-secondary">
            {errorText} {p.safe}
          </p>
        </div>
      </div>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-action text-sm font-medium text-on-action transition-colors hover:bg-action-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
        >
          <RotateCcw size={15} aria-hidden="true" />
          {p.retry}
        </button>
      )}
    </div>
  );
}
