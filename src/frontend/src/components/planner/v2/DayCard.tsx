"use client";

import { useId, useState } from "react";
import { ChevronDown, ExternalLink } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { useLanguage } from "@/context/LanguageContext";
import { useFormatters } from "@/hooks/useFormatters";
import { interpolate } from "@/i18n";
import { partOf, type DayDraft, type ItineraryWarning } from "@/hooks/plannerReducer";
import { DAY_PARTS, type DayPart, type Slot } from "@/types/planner";
import { cn } from "@/utils/cn";
import { WarningBadge } from "./WarningBadge";

export interface DayCardProps {
  day: DayDraft;
  /** ISO date for this day, or `null` when the brief has no start date. */
  date: string | null;
  /** The itinerary's warnings; the card picks the ones aimed at its slots. */
  warnings: ItineraryWarning[];
  defaultOpen?: boolean;
  /** Position in the panel: staggers the entrance by 80 ms per day. */
  index?: number;
  onChange: (slot: Slot) => void;
  onRemove: (slot: Slot, cardId: string) => void;
}

const DATE_OPTIONS: Intl.DateTimeFormatOptions = {
  weekday: "short",
  day: "numeric",
  month: "short",
  timeZone: "UTC",
};

/**
 * One day of the draft itinerary: a collapsible header (date, weather, how
 * many experiences) over the four parts of the day and their cards. The body
 * stays mounted so the expand/collapse can animate (a `grid-rows` transition
 * over an `overflow-hidden` wrapper); while collapsed it is `inert` and hidden
 * from assistive technology, exactly as `MobileDrawer` does.
 */
export function DayCard({
  day,
  date,
  warnings,
  defaultOpen = false,
  index = 0,
  onChange,
  onRemove,
}: DayCardProps) {
  const { t } = useLanguage();
  const { formatDate } = useFormatters();
  const [expanded, setExpanded] = useState(defaultOpen);
  const bodyId = useId();
  const p = t.plan.panel;

  const count = DAY_PARTS.reduce((total, part) => total + day.slots[part].length, 0);
  const dayLabel = interpolate(p.day, { day: day.day });

  const warningsFor = (part: DayPart) =>
    warnings.filter((w) => w.slot !== null && w.slot.day === day.day && partOf(w.slot) === part);

  return (
    <div className="animate-fade-up" style={{ animationDelay: `${index * 80}ms` }}>
      <Card className="flex flex-col gap-3 p-4">
        <button
          type="button"
          onClick={() => setExpanded((open) => !open)}
          aria-expanded={expanded}
          aria-controls={bodyId}
          title={interpolate(expanded ? p.hideDay : p.showDay, { day: day.day })}
          className="flex w-full items-start gap-3 rounded-xl text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-soft text-sm font-medium text-text-primary">
            {day.day}
          </span>
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="text-[10px] font-medium uppercase tracking-wider text-text-secondary">
              {dayLabel}
            </span>
            {day.title && (
              <span className="text-[15px] font-medium leading-tight text-text-primary">
                {day.title}
              </span>
            )}
            <span className="flex flex-wrap items-center gap-x-1.5 text-xs text-text-secondary">
              {date && <span>{formatDate(date, DATE_OPTIONS)}</span>}
              {day.weather && (
                <>
                  {date && <span aria-hidden="true">·</span>}
                  <span title={interpolate(p.weatherSource, { source: day.weather.source })}>
                    {day.weather.summary}
                  </span>
                  {day.weather.t_max !== null && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span>{`${day.weather.t_max} °C`}</span>
                    </>
                  )}
                </>
              )}
              <span aria-hidden="true">·</span>
              <span>{count === 1 ? p.experienceOne : interpolate(p.experiences, { count })}</span>
            </span>
          </span>
          <ChevronDown
            size={16}
            aria-hidden="true"
            className={cn("mt-1 shrink-0 text-text-secondary transition-transform", expanded && "rotate-180")}
          />
        </button>

        <div
          id={bodyId}
          inert={!expanded}
          aria-hidden={!expanded}
          className={cn(
            "grid transition-[grid-template-rows] duration-300 ease-out motion-reduce:transition-none",
            expanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
          )}
        >
          <div className="flex flex-col gap-4 overflow-hidden">
            {DAY_PARTS.map((part) => {
              const cards = day.slots[part];
              const partLabel = t.plan.parts[part];
              const partWarnings = warningsFor(part);
              return (
                <section key={part} aria-label={`${dayLabel} · ${partLabel}`} className="flex flex-col gap-2">
                  <h4 className="text-[10px] font-medium uppercase tracking-wider text-text-secondary">
                    {partLabel}
                  </h4>

                  {cards.length === 0 ? (
                    <div className="flex items-center justify-between gap-3 rounded-xl border border-dashed border-border-soft px-3 py-2">
                      <span className="text-xs italic text-text-muted">{p.emptySlot}</span>
                      <button
                        type="button"
                        onClick={() => onChange({ day: day.day, part })}
                        aria-label={`${p.change}: ${partLabel}`}
                        className="shrink-0 rounded-lg border border-border-soft px-2.5 py-1 text-xs text-text-secondary transition hover:border-accent/40 hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
                      >
                        {p.change}
                      </button>
                    </div>
                  ) : (
                    <ul className="flex flex-col gap-2">
                      {cards.map((card) => {
                        const meta = [
                          card.district,
                          card.hours,
                          card.price_tier === null
                            ? null
                            : t.plan.priceTiers[String(card.price_tier) as "1" | "2" | "3"],
                        ].filter((entry): entry is string => !!entry);

                        return (
                          <li
                            key={card.id}
                            className="flex animate-fade-in flex-wrap items-start gap-x-3 gap-y-2 rounded-xl border border-border bg-bg-surface px-3 py-2"
                          >
                            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                              <span className="text-sm font-medium leading-tight text-text-primary">
                                {card.title}
                              </span>
                              {meta.length > 0 && (
                                <span className="text-xs text-text-secondary">{meta.join(" · ")}</span>
                              )}
                              {card.source && (
                                <a
                                  href={card.source_url || undefined}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  title={card.license || undefined}
                                  className="mt-0.5 inline-flex w-fit items-center gap-1 rounded-full border border-border-soft px-2 py-0.5 text-[10px] uppercase tracking-wider text-text-secondary transition hover:border-accent/40 hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
                                >
                                  {interpolate(t.plan.card.source, { source: card.source })}
                                  <ExternalLink size={10} aria-hidden="true" />
                                </a>
                              )}
                            </div>
                            <div className="flex shrink-0 items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => onChange({ day: day.day, part })}
                                aria-label={`${p.change}: ${card.title}`}
                                className="rounded-lg border border-border-soft px-2.5 py-1 text-xs text-text-secondary transition hover:border-accent/40 hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
                              >
                                {p.change}
                              </button>
                              <button
                                type="button"
                                onClick={() => onRemove({ day: day.day, part }, card.id)}
                                aria-label={`${p.remove}: ${card.title}`}
                                className="rounded-lg px-2.5 py-1 text-xs text-text-secondary transition hover:text-error focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
                              >
                                {p.remove}
                              </button>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )}

                  {partWarnings.map((warning) => (
                    <WarningBadge key={`${warning.code}:${warning.message}`} warning={warning} />
                  ))}
                </section>
              );
            })}
          </div>
        </div>
      </Card>
    </div>
  );
}
