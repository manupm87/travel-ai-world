"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { useLanguage } from "@/context/LanguageContext";
import { interpolate } from "@/i18n";
import type { ItineraryDraft } from "@/hooks/plannerReducer";
import { DAY_PARTS, type DayPart, type Slot } from "@/types/planner";
import { cn } from "@/utils/cn";

export interface SlotPickerProps {
  /** The itinerary's day numbers, in order: one button each. */
  days: number[];
  /** Read to preselect the first part of the chosen day that is still empty. */
  itinerary: ItineraryDraft;
  /** The day to open on; the first of `days` when it holds no such day. */
  day?: number | null;
  onPick: (slot: Slot) => void;
  onCancel: () => void;
  className?: string;
}

/**
 * The first part of a day with nothing in it, or the morning when the day is
 * full (or unknown): where a card lands unless the traveller says otherwise.
 */
export function firstEmptyPart(itinerary: ItineraryDraft, day: number): DayPart {
  const draft = itinerary.days.find((d) => d.day === day);
  if (!draft) return "morning";
  return DAY_PARTS.find((part) => draft.slots[part].length === 0) ?? "morning";
}

/**
 * Where an unplaced card goes (TRA-185): a small inline popover — never a
 * modal — with the trip's days as a row of buttons and the four parts of the
 * day as chips. Arrows move along the day row, Escape cancels; the card that
 * opened it takes the focus back.
 */
export function SlotPicker({
  days,
  itinerary,
  day = null,
  onPick,
  onCancel,
  className,
}: SlotPickerProps) {
  const { t } = useLanguage();
  const sp = t.plan.slotPicker;
  const first = days[0] ?? 1;
  const opening = day !== null && days.includes(day) ? day : first;

  const [chosenDay, setChosenDay] = useState(opening);
  const [chosenPart, setChosenPart] = useState<DayPart>(() =>
    firstEmptyPart(itinerary, opening)
  );
  const dayRowRef = useRef<HTMLDivElement>(null);

  // The day row is the first choice to make, so it takes the focus; the
  // traveller can confirm the default straight away with Tab + Enter.
  useEffect(() => {
    dayRowRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
  }, []);

  const pickDay = (next: number) => {
    setChosenDay(next);
    // A new day brings its own first free part; an explicit part choice
    // afterwards overrides it.
    setChosenPart(firstEmptyPart(itinerary, next));
  };

  const onDayKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    const index = days.indexOf(chosenDay);
    const next = days[index + (event.key === "ArrowRight" ? 1 : -1)];
    if (next === undefined) return;
    event.preventDefault();
    pickDay(next);
    const buttons = dayRowRef.current?.querySelectorAll<HTMLButtonElement>("button");
    buttons?.[days.indexOf(next)]?.focus();
  };

  return (
    <div
      role="group"
      aria-label={sp.title}
      onKeyDown={(event) => {
        if (event.key !== "Escape") return;
        event.preventDefault();
        onCancel();
      }}
      className={cn(
        "flex animate-scale-in flex-col gap-2 rounded-xl border border-border bg-bg-surface p-2.5",
        className
      )}
    >
      <p className="text-xs font-medium text-text-secondary">
        {sp.title}
      </p>

      <div
        ref={dayRowRef}
        role="group"
        aria-label={sp.day}
        onKeyDown={onDayKeyDown}
        className="flex flex-wrap gap-1"
      >
        {days.map((value) => (
          <button
            key={value}
            type="button"
            aria-pressed={value === chosenDay}
            onClick={() => pickDay(value)}
            className={cn(
              "rounded-lg border px-2 py-1 text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40",
              value === chosenDay
                ? "border-accent bg-accent text-white"
                : "border-border-soft text-text-secondary hover:border-accent/50 hover:text-text-primary"
            )}
          >
            {/* The same "Day N" the trip panel shows, so both name a day alike. */}
            {interpolate(t.plan.panel.day, { day: value })}
          </button>
        ))}
      </div>

      <div role="group" aria-label={sp.part} className="flex flex-wrap gap-1">
        {DAY_PARTS.map((part) => (
          <button
            key={part}
            type="button"
            aria-pressed={part === chosenPart}
            onClick={() => setChosenPart(part)}
            className={cn(
              "rounded-full border px-2.5 py-1 text-xs transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40",
              part === chosenPart
                ? "border-accent text-accent"
                : "border-border-soft text-text-secondary hover:border-accent/50 hover:text-text-primary"
            )}
          >
            {t.plan.parts[part]}
          </button>
        ))}
      </div>

      <div className="flex gap-1.5">
        <button
          type="button"
          onClick={() => onPick({ day: chosenDay, part: chosenPart })}
          className="rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white transition hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
        >
          {sp.confirm}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg px-3 py-1.5 text-xs text-text-secondary transition hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
        >
          {sp.cancel}
        </button>
      </div>
    </div>
  );
}
