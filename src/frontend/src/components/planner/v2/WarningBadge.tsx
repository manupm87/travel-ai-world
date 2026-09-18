"use client";

import { AlertTriangle } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import type { ItineraryWarning } from "@/hooks/plannerReducer";

/**
 * One `warn` op from the itinerary patch, inline: the model writes the
 * sentence, so the badge shows `warning.message` and only falls back to the
 * translated copy for the code when the message is empty.
 */
export function WarningBadge({ warning }: { warning: ItineraryWarning }) {
  const { t } = useLanguage();
  const text = warning.message || t.plan.panel.warnings[warning.code];

  return (
    <span
      role="status"
      data-warning={warning.code}
      className="inline-flex animate-scale-in items-start gap-1.5 rounded-lg border border-warning/30 bg-warning/10 px-2 py-1 text-xs leading-snug text-warning"
    >
      <AlertTriangle size={12} aria-hidden="true" className="mt-0.5 shrink-0" />
      <span>{text}</span>
    </span>
  );
}
