"use client";

import { useId, useState } from "react";
import { ChevronDown, ChevronRight, Plus } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { useFormatters } from "@/hooks/useFormatters";
import { interpolate } from "@/i18n";
import { partOf, type DayDraft, type ItineraryWarning } from "@/hooks/plannerReducer";
import { DAY_PARTS, type DayPart, type Slot } from "@/types/planner";
import { cn } from "@/utils/cn";
import { stopGlyph, stopId, type MapStop } from "./mapStops";
import { DATE_OPTIONS } from "@/utils/tripDates";
import { WarningBadge } from "./WarningBadge";

/** The hour a part of the day reads as — the same the saved trip stores. */
const PART_TIME: Record<DayPart, string> = {
  morning: "10:00",
  afternoon: "15:00",
  evening: "19:00",
  night: "22:00",
};

/** The day's own date, said in full over its title. */
const LONG_DATE: Intl.DateTimeFormatOptions = {
  weekday: "long",
  day: "numeric",
  month: "long",
  timeZone: "UTC",
};

export interface DayCardProps {
  day: DayDraft;
  /** ISO date for this day, or `null` when the brief has no start date. */
  date: string | null;
  /** The itinerary's warnings; the card picks the ones aimed at its slots. */
  warnings: ItineraryWarning[];
  defaultOpen?: boolean;
  /**
   * The only day on screen (`TripPanel` behind `DayStrip`): no toggle, always
   * open. The collapsible mode stays for anywhere a stack of days is wanted.
   */
  static?: boolean;
  /** Position in the panel: staggers the entrance by 80 ms per day. */
  index?: number;
  /**
   * This day's pins (`toMapStops`), so a card that is on the map carries the
   * pin's number. Empty (the default) hides the badges; a card without
   * coordinates has no pin and no number, but is still selectable.
   */
  mapStops?: MapStop[];
  /** The selected stop, `null` for none; the same id scheme as the map. */
  selectedStopId?: string | null;
  /** Without it the rows are plain text: nothing to select, no detail to open. */
  onSelectStop?: (id: string | null) => void;
  /** Without them the day is read only: no "Change", no "Remove", no "Add a stop". */
  onChange?: (slot: Slot) => void;
  onRemove?: (slot: Slot, cardId: string) => void;
  /** The day after this one, offered at the foot of the card (TRA-244). */
  next?: { day: number; title: string | null; date: string | null } | null;
  onNext?: () => void;
}

/**
 * One day of the draft itinerary, as the canvas's planner draws it (TRA-244):
 * the date over "Day 1: Pest on foot" and how many stops, then the day as a
 * timeline — each stop at its hour, numbered like its pin on the map, with its
 * district and hours, a dotted line down to the next — and "Add a stop" where
 * a part of the day is empty. At the foot, the next day, one press away.
 *
 * Each stop is a button (TRA-179): it selects the stop, which highlights its
 * pin on the map and turns this column into the activity's own page
 * (`ActivityDetail`), where its photo and its source are. "Change" and
 * "Remove" are separate buttons beside it, so neither is ever a click on the
 * row. Without `static` the header toggles the body (kept mounted, `inert`
 * while collapsed), for anywhere a stack of days is wanted.
 */
export function DayCard({
  day,
  date,
  warnings,
  defaultOpen = false,
  static: isStatic = false,
  index = 0,
  mapStops = [],
  selectedStopId = null,
  onSelectStop,
  onChange,
  onRemove,
  next = null,
  onNext,
}: DayCardProps) {
  const { t } = useLanguage();
  const { formatDate } = useFormatters();
  const [expanded, setExpanded] = useState(defaultOpen);
  const bodyId = useId();
  const p = t.plan.panel;
  const open = isStatic || expanded;

  const count = DAY_PARTS.reduce((total, part) => total + day.slots[part].length, 0);
  const dayLabel = interpolate(p.day, { day: day.day });

  const warningsFor = (part: DayPart) =>
    warnings.filter((w) => w.slot !== null && w.slot.day === day.day && partOf(w.slot) === part);

  const stopFor = (id: string): MapStop | null =>
    mapStops.find((stop) => stop.id === id) ?? null;

  const summary = (
    <span className="flex min-w-0 flex-1 flex-col gap-1">
      <span className="flex items-baseline justify-between gap-3">
        <span className="text-[13px] text-text-secondary first-letter:uppercase">
          {date ? formatDate(date, LONG_DATE) : null}
        </span>
        <span className="shrink-0 text-[13px] text-text-secondary">
          {count === 1 ? p.experienceOne : interpolate(p.experiences, { count })}
        </span>
      </span>
      <span className="font-heading text-[22px] leading-tight font-light tracking-[-0.02em] text-text-primary">
        <span>{dayLabel}</span>
        {day.title && (
          <>
            <span aria-hidden="true">: </span>
            <span>{day.title}</span>
          </>
        )}
      </span>
      {(day.weather || date) && (
        <span className="flex flex-wrap items-center gap-x-2 text-xs text-text-muted">
          {date && <span className="sr-only">{formatDate(date, DATE_OPTIONS)}</span>}
          {day.weather && (
            <>
              <span title={interpolate(p.weatherSource, { source: day.weather.source })}>
                {day.weather.summary}
              </span>
              {day.weather.t_max !== null && <span>{`${day.weather.t_max} °C`}</span>}
            </>
          )}
        </span>
      )}
    </span>
  );

  // Every stop of the day in order, so the dotted line knows which is last.
  const lastPart = [...DAY_PARTS].reverse().find((part) => day.slots[part].length > 0) ?? null;

  return (
    <div
      className="flex animate-fade-up flex-col gap-4"
      style={{ animationDelay: `${index * 80}ms` }}
    >
      {isStatic ? (
        <div className="flex w-full items-start text-left">{summary}</div>
      ) : (
        <button
          type="button"
          onClick={() => setExpanded((current) => !current)}
          aria-expanded={expanded}
          aria-controls={bodyId}
          title={interpolate(expanded ? p.hideDay : p.showDay, { day: day.day })}
          className="flex w-full items-start gap-3 rounded-xl text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
        >
          {summary}
          <ChevronDown
            size={16}
            aria-hidden="true"
            className={cn("mt-1 shrink-0 text-text-secondary transition-transform", expanded && "rotate-180")}
          />
        </button>
      )}

      <div
        id={bodyId}
        inert={isStatic ? undefined : !expanded}
        aria-hidden={isStatic ? undefined : !expanded}
        className={cn(
          "grid transition-[grid-template-rows] duration-300 ease-out motion-reduce:transition-none",
          open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
        )}
      >
        {/* Clipped only while it can collapse: open, a sticker's edge must show. */}
        <div className={cn("flex flex-col", !isStatic && "overflow-hidden")}>
          {DAY_PARTS.map((part) => {
            const cards = day.slots[part];
            const partLabel = t.plan.parts[part];
            const partWarnings = warningsFor(part);
            return (
              <section
                key={part}
                aria-label={`${dayLabel} · ${partLabel}`}
                className="flex flex-col"
              >
                {cards.length === 0 ? (
                  onChange ? (
                    <div className="flex items-center gap-3 py-1.5">
                      <span className="w-12 shrink-0 text-xs text-text-muted">
                        {PART_TIME[part]}
                      </span>
                      <button
                        type="button"
                        onClick={() => onChange({ day: day.day, part })}
                        aria-label={`${p.addStop}: ${partLabel}`}
                        className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-dashed border-glass-border px-3 py-2.5 text-sm text-text-secondary transition hover:border-accent-border hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
                      >
                        <Plus size={15} aria-hidden="true" />
                        <span>{p.addStop}</span>
                        <span className="sr-only">{p.emptySlot}</span>
                      </button>
                    </div>
                  ) : (
                    <p className="flex items-center gap-3 py-1.5 text-xs italic text-text-muted">
                      <span className="w-12 shrink-0 not-italic">{PART_TIME[part]}</span>
                      {p.emptySlot}
                    </p>
                  )
                ) : (
                  <ul className="flex flex-col">
                    {cards.map((card, position) => {
                      const meta = [
                        card.district,
                        card.hours,
                        card.price_tier === null
                          ? null
                          : t.plan.priceTiers[String(card.price_tier) as "1" | "2" | "3"],
                      ].filter((entry): entry is string => !!entry);

                      const id = stopId(day.day, part, card.id);
                      const stop = stopFor(id);
                      const selected = id === selectedStopId;
                      const last = part === lastPart && position === cards.length - 1;

                      const body = (
                        <>
                          <span className="w-12 shrink-0 pt-0.5 text-[13px] tabular-nums text-text-secondary">
                            {position === 0 ? PART_TIME[part] : ""}
                          </span>
                          <span
                            aria-hidden="true"
                            className={cn(
                              "relative z-10 mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold transition",
                              selected ? "bg-accent text-on-action" : "bg-action text-on-action"
                            )}
                          >
                            {stop ? stopGlyph(stop) : "·"}
                          </span>
                          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                            <span className="text-[15px] font-semibold leading-snug text-text-primary">
                              {card.title}
                            </span>
                            {meta.length > 0 && (
                              <span className="text-[13px] text-text-secondary">
                                {meta.join(", ")}
                              </span>
                            )}
                          </span>
                        </>
                      );

                      return (
                        <li
                          key={card.id}
                          data-stop-row={id}
                          data-selected={selected}
                          className={cn(
                            "group relative flex animate-fade-in flex-col rounded-xl px-2 py-2 transition-colors motion-reduce:transition-none",
                            selected ? "bg-bg-surface" : "hover:bg-bg-surface/60"
                          )}
                        >
                          {/* The dotted line down to the next stop of the day. */}
                          {!last && (
                            <span
                              aria-hidden="true"
                              className="absolute top-9 bottom-[-0.5rem] left-[4.75rem] border-l border-dashed border-text-muted/50"
                            />
                          )}
                          {onSelectStop ? (
                            <button
                              type="button"
                              onClick={() => onSelectStop(selected ? null : id)}
                              aria-pressed={selected}
                              aria-label={interpolate(t.plan.detail.open, { title: card.title })}
                              data-stop-index={stop ? stopGlyph(stop) : undefined}
                              className="flex w-full items-start gap-3 rounded-lg text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
                            >
                              {body}
                            </button>
                          ) : (
                            <div className="flex w-full items-start gap-3 text-left">{body}</div>
                          )}
                          {(onChange || onRemove) && (
                            <span className="ml-[5.25rem] mt-1 flex items-center gap-1 opacity-70 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                              {onChange && (
                                <button
                                  type="button"
                                  onClick={() => onChange({ day: day.day, part })}
                                  aria-label={`${p.change}: ${card.title}`}
                                  className="rounded-lg border border-glass-border px-2.5 py-1 text-xs text-text-secondary transition hover:border-accent-border hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
                                >
                                  {p.change}
                                </button>
                              )}
                              {onRemove && (
                                <button
                                  type="button"
                                  onClick={() => onRemove({ day: day.day, part }, card.id)}
                                  aria-label={`${p.remove}: ${card.title}`}
                                  className="rounded-lg px-2.5 py-1 text-xs text-text-secondary transition hover:text-error focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
                                >
                                  {p.remove}
                                </button>
                              )}
                            </span>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}

                {partWarnings.length > 0 && (
                  <div className="ml-[5.25rem] flex flex-col gap-2 py-1.5">
                    {partWarnings.map((warning) => (
                      <WarningBadge key={`${warning.code}:${warning.message}`} warning={warning} />
                    ))}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      </div>

      {open && next && onNext && (
        <button
          type="button"
          onClick={onNext}
          className="mt-1 flex items-center gap-3 rounded-2xl border border-glass-border bg-bg-surface/50 px-4 py-3 text-left transition hover:border-accent-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
        >
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-sm font-semibold text-text-primary">
              {interpolate(p.day, { day: next.day })}
              {next.title ? `: ${next.title}` : ""}
            </span>
            {next.date && (
              <span className="text-[13px] text-text-secondary first-letter:uppercase">
                {formatDate(next.date, LONG_DATE)}
              </span>
            )}
          </span>
          <ChevronRight size={16} aria-hidden="true" className="shrink-0 text-text-secondary" />
        </button>
      )}
    </div>
  );
}
