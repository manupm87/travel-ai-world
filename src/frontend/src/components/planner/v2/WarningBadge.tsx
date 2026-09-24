"use client";

import { CalendarClock, Clock, Footprints, Weight } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import type { ItineraryWarning } from "@/hooks/plannerReducer";
import type { WarnCode } from "@/types/planner";
import { cn } from "@/utils/cn";

/**
 * Each warning's sticker (TRA-239): its colour and its drawing. Overweight is
 * a day with more than its pace allows; far and closed are fragile; a price
 * nobody could check is one to book ahead and confirm.
 */
const STICKER: Record<WarnCode, { tone: string; Icon: typeof Weight }> = {
  overloaded_day: { tone: "bg-sticker-overweight", Icon: Weight },
  too_far: { tone: "bg-sticker-fragile", Icon: Footprints },
  closed: { tone: "bg-sticker-fragile", Icon: Clock },
  unverified_price: { tone: "bg-sticker-book", Icon: CalendarClock },
};

/**
 * One `warn` op from the itinerary patch, stuck on the day as a sticker: the
 * sticker's name in bold ("Overweight") and under it the model's own sentence,
 * falling back to the translated copy for the code when the message is empty.
 * A light border and a slight tilt make it read as stuck on, not printed.
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
        "inline-flex max-w-full -rotate-1 animate-scale-in items-center gap-2.5 self-start rounded-xl py-1.5 pr-3.5 pl-1.5 text-sticker-ink shadow-[0_0_0_2.5px_#EFEDE7,0_10px_18px_-10px_rgba(0,0,0,0.7)]",
        tone
      )}
    >
      <span
        aria-hidden="true"
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-black/10"
      >
        <Icon size={14} />
      </span>
      <span className="flex min-w-0 flex-col text-[12px] leading-tight">
        <span className="font-bold">{t.plan.packing.stickers[warning.code]}</span>
        <span className="opacity-80">{text}</span>
      </span>
    </span>
  );
}
