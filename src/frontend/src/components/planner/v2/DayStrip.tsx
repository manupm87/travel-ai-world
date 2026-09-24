"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { ChevronLeft, ChevronRight, LayoutGrid } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { useFormatters } from "@/hooks/useFormatters";
import { interpolate } from "@/i18n";
import type { DayDraft } from "@/hooks/plannerReducer";
import { DAY_PARTS } from "@/types/planner";
import { cn } from "@/utils/cn";
import { DATE_OPTIONS, dateForDay } from "@/utils/tripDates";

export interface DayStripProps {
  /** The itinerary's days, in day order. */
  days: DayDraft[];
  /** The trip's first date (`brief.start_date`), or `null` when unknown. */
  startDate: string | null;
  /**
   * The day currently shown by the panel and the map slot, or `null` for the
   * trip overview — the leading chip (TRA-177).
   */
  selectedDay: number | null;
  /** The one region the chips drive (`TripPanel`'s day panel). */
  panelId?: string;
  onSelect: (day: number | null) => void;
}

/** One chip plus the gap: how far the arrows scroll when there is no layout. */
const CHIP_STEP_PX = 180;

/** `behavior: "smooth"` unless the reader asked for less motion. */
function scrollBehavior(): ScrollBehavior {
  const reduced =
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  return reduced ? "auto" : "smooth";
}

/** The canvas's day pills (TRA-238): the chosen one filled with the action. */
const PILL =
  "flex h-9 shrink-0 snap-start items-center gap-1.5 rounded-full border px-3.5 text-[13px] font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40";
const PILL_ON = "border-transparent bg-action text-on-action";
const PILL_OFF = "border-glass-border bg-glass-bg text-text-primary hover:border-accent-border";

/**
 * The itinerary browsed day by day: a horizontal tablist over what the panel
 * shows below it — a leading "Whole trip" chip for the overview (TRA-177),
 * then one chip per day carrying the day number, its date, the forecast's
 * maximum and how many experiences are planned. Keyboard navigation matches
 * `PlannerLayout`'s tabs (arrows, Home, End) and counts the leading chip like
 * any other; when the strip overflows, the arrows of `OptionCarousel` scroll it.
 */
export function DayStrip({
  days,
  startDate,
  selectedDay,
  panelId,
  onSelect,
}: DayStripProps) {
  const { t } = useLanguage();
  const { formatDate } = useFormatters();
  const listRef = useRef<HTMLDivElement>(null);
  const [overflow, setOverflow] = useState(false);
  const p = t.plan.panel;

  // The chips in the order they are rendered and navigated: the overview
  // first, then the days. `null` is the overview at both ends — the value the
  // chip selects and the value that marks it selected.
  const chips: (number | null)[] = [null, ...days.map((day) => day.day)];
  const selectedIndex = chips.indexOf(selectedDay);

  const tabs = () =>
    Array.from(listRef.current?.querySelectorAll<HTMLElement>('[role="tab"]') ?? []);

  // Arrows only when there is something to scroll to, so a two-day trip keeps
  // its chips flush left. The list is `flex-1` inside a flex row, so its own box
  // is sized by the parent and never by the chips: watching it alone would miss
  // content that grows or shrinks. The first chip is watched too, and `t` re-runs
  // the effect when the reader switches language ("Day 1" → "Día 1").
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const update = () => setOverflow(list.scrollWidth > list.clientWidth + 1);
    update();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(update);
    observer.observe(list);
    const first = list.firstElementChild;
    if (first) observer.observe(first);
    return () => observer.disconnect();
  }, [days.length, t]);

  // The selected chip is always in sight, however the day was picked (a click,
  // the keyboard, or the itinerary growing while it streams). The strip scrolls
  // itself horizontally instead of calling `scrollIntoView`: that would also
  // scroll the panel's vertical scroller ("nearest" block), pulling the heading,
  // the route and the map off screen the moment the trip appears.
  useEffect(() => {
    const list = listRef.current;
    const chip = selectedIndex < 0 ? null : tabs()[selectedIndex];
    if (!list || !chip) return;
    const listBox = list.getBoundingClientRect();
    const chipBox = chip.getBoundingClientRect();
    // "nearest": move only as far as it takes to make the whole chip visible.
    const left =
      chipBox.left < listBox.left
        ? chipBox.left - listBox.left
        : chipBox.right > listBox.right
          ? chipBox.right - listBox.right
          : 0;
    if (left === 0) return;
    list.scrollBy?.({ left, behavior: scrollBehavior() });
  }, [selectedIndex, days.length]);

  const scrollByChip = (direction: 1 | -1) => {
    const list = listRef.current;
    if (!list) return;
    const width = tabs()[0]?.getBoundingClientRect().width ?? 0;
    const step = width > 0 ? width + 8 : CHIP_STEP_PX;
    list.scrollBy?.({ left: direction * step, behavior: scrollBehavior() });
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const index = selectedIndex < 0 ? 0 : selectedIndex;
    let next: number | null = null;
    if (event.key === "ArrowRight") next = (index + 1) % chips.length;
    if (event.key === "ArrowLeft") next = (index - 1 + chips.length) % chips.length;
    if (event.key === "Home") next = 0;
    if (event.key === "End") next = chips.length - 1;
    if (next === null || next < 0 || next >= chips.length) return;
    event.preventDefault();
    onSelect(chips[next] ?? null);
    tabs()[next]?.focus();
  };

  const arrow = (direction: 1 | -1) => (
    <button
      type="button"
      onClick={() => scrollByChip(direction)}
      aria-label={direction === -1 ? t.plan.carousel.previous : t.plan.carousel.next}
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-glass-border text-text-secondary transition hover:border-accent/50 hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
    >
      {direction === -1 ? (
        <ChevronLeft size={14} aria-hidden="true" />
      ) : (
        <ChevronRight size={14} aria-hidden="true" />
      )}
    </button>
  );

  return (
    <div className="flex items-center gap-1">
      {overflow && arrow(-1)}

      <div
        ref={listRef}
        role="tablist"
        aria-label={p.daysNav}
        aria-orientation="horizontal"
        onKeyDown={onKeyDown}
        className="flex min-w-0 flex-1 snap-x snap-mandatory gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        <button
          type="button"
          role="tab"
          aria-selected={selectedDay === null}
          aria-controls={panelId}
          tabIndex={selectedDay === null ? 0 : -1}
          data-day="all"
          onClick={() => onSelect(null)}
          className={cn(PILL, selectedDay === null ? PILL_ON : PILL_OFF)}
        >
          <LayoutGrid size={14} aria-hidden="true" />
          <span className="whitespace-nowrap">{p.wholeTrip}</span>
        </button>

        {days.map((day) => {
          const active = day.day === selectedDay;
          const date = dateForDay(startDate, day.day);
          const count = DAY_PARTS.reduce((total, part) => total + day.slots[part].length, 0);

          return (
            <button
              key={day.day}
              type="button"
              role="tab"
              aria-selected={active}
              aria-controls={panelId}
              tabIndex={active ? 0 : -1}
              data-day={day.day}
              onClick={() => onSelect(day.day)}
              className={cn(PILL, active ? PILL_ON : PILL_OFF)}
            >
              <span className="whitespace-nowrap">{interpolate(p.day, { day: day.day })}</span>
              {date && (
                <span className={cn("whitespace-nowrap text-[12px] font-normal", active ? "opacity-70" : "text-text-muted")}>
                  {formatDate(date, DATE_OPTIONS)}
                </span>
              )}
              {day.weather !== null && day.weather.t_max !== null && (
                <span className={cn("whitespace-nowrap text-[12px] font-normal", active ? "opacity-70" : "text-text-muted")}>
                  {`${day.weather.t_max} °C`}
                </span>
              )}
              <span className="sr-only">
                {count === 1 ? p.experienceOne : interpolate(p.experiences, { count })}
              </span>
            </button>
          );
        })}
      </div>

      {overflow && arrow(1)}
    </div>
  );
}
