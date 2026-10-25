"use client";

/** A planner warning as a sticker. */

import { CalendarClock, Clock, Footprints, Weight } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import type { ItineraryWarning } from "@/hooks/plannerReducer";
import type { WarnCode } from "@/types/planner";
import { cn } from "@/utils/cn";

/**
 * Each warning's sticker: its colour and its drawing. Overweight is a day over
 * its pace; far and closed are fragile; an unchecked price is book-ahead.
 */
const STICKER: Record<WarnCode, { tone: string; Icon: typeof Weight }> = {
  overloaded_day: { tone: "bg-sticker-overweight", Icon: Weight },
  too_far: { tone: "bg-sticker-fragile", Icon: Footprints },
  closed: { tone: "bg-sticker-fragile", Icon: Clock },
  unverified_price: { tone: "bg-sticker-book", Icon: CalendarClock },
};

/**
 * One `warn` op from the itinerary patch, as a sticker on the day: its name in
 * bold and the model's sentence, or the translated copy for the code when empty.
 */
export function WarningBadge({ warning }: { warning: ItineraryWarning }) {
  const { t } = useLanguage();
  const text = warning.message || t.plan.panel.warnings[warning.code];
  const { tone, Icon } = STICKER[warning.code];

  return (
    <span
      role="status"
      data-warning={warning.code}
      className={cn(
        // the white edge is an inner border: an outer ring would be clipped by the card's edges
        "inline-flex max-w-full animate-scale-in items-center gap-2.5 self-start rounded-xl border-2 border-sticker-paper py-1.5 pr-3.5 pl-1.5 text-sticker-ink shadow-[0_8px_16px_-10px_rgba(0,0,0,0.7)]",
        tone
      )}
    >
      <span
        aria-hidden="true"
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-scrim/10"
      >
        <Icon size={14} />
      </span>
      <span className="flex min-w-0 flex-col text-[13px] leading-snug [overflow-wrap:anywhere]">
        <span className="font-bold">{t.plan.packing.stickers[warning.code]}</span>
        <span className="opacity-80">{text}</span>
      </span>
    </span>
  );
}
