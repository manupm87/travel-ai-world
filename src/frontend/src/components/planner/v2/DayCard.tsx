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
import { stopGlyph, stopId, type MapStop } from "./mapStops";
import { DATE_OPTIONS } from "@/utils/tripDates";
import { WarningBadge } from "./WarningBadge";

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
  /** Without them the day is read only: no "Change", no "Remove". */
  onChange?: (slot: Slot) => void;
  onRemove?: (slot: Slot, cardId: string) => void;
}

/**
 * One day of the draft itinerary: a header (date, weather, how many
 * experiences) over the four parts of the day and their cards. The header
 * toggles the body by default: it stays mounted so the expand/collapse can
 * animate (a `grid-rows` transition over an `overflow-hidden` wrapper), and
 * while collapsed it is `inert` and hidden from assistive technology, exactly
 * as `MobileDrawer` does. With `static` there is nothing to toggle — the day
 * is the only one on screen, so the header is plain text and the body is open.
 *
 * Each stop is a button (TRA-179): it selects the stop, which highlights its
 * pin on the map and turns this column into the activity's own page
 * (`ActivityDetail`). "Change" and "Remove" are separate buttons beside it, so
 * neither is ever a click on the row.
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
    <>
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
    </>
  );

  return (
    <div className="animate-fade-up" style={{ animationDelay: `${index * 80}ms` }}>
      <Card className="flex flex-col gap-3 p-4">
        {isStatic ? (
          <div className="flex w-full items-start gap-3 text-left">{summary}</div>
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
              className={cn(
                "mt-1 shrink-0 text-text-secondary transition-transform",
                expanded && "rotate-180"
              )}
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
                      {onChange && (
                        <button
                          type="button"
                          onClick={() => onChange({ day: day.day, part })}
                          aria-label={`${p.change}: ${partLabel}`}
                          className="shrink-0 rounded-lg border border-border-soft px-2.5 py-1 text-xs text-text-secondary transition hover:border-accent/40 hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
                        >
                          {p.change}
                        </button>
                      )}
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

                        const id = stopId(day.day, part, card.id);
                        const stop = stopFor(id);
                        const selected = id === selectedStopId;

                        // Everything down to the meta line belongs to the
                        // button that opens the activity; the source link and
                        // the two actions cannot live inside it (a link or a
                        // button nested in a button is invalid), so they sit
                        // on their own line under it.
                        const body = (
                          <>
                            {stop && (
                              <span
                                aria-hidden="true"
                                className={cn(
                                  "flex h-6 w-6 shrink-0 items-center justify-center self-center rounded-full text-[11px] font-medium transition",
                                  selected
                                    ? "bg-action text-on-action"
                                    : "bg-accent-soft text-text-primary"
                                )}
                              >
                                {stopGlyph(stop)}
                              </span>
                            )}
                            <span className="h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-bg-card">
                              {card.image_url ? (
                                // Remote Wikimedia images on a static export: no optimizer to route them through.
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  src={card.image_url}
                                  alt=""
                                  title={
                                    card.image_credit
                                      ? interpolate(t.plan.card.imageCredit, { credit: card.image_credit })
                                      : undefined
                                  }
                                  loading="lazy"
                                  className="h-full w-full object-cover"
                                />
                              ) : (
                                <span
                                  aria-hidden="true"
                                  className="block h-full w-full bg-gradient-to-br from-accent/30 via-purple/20 to-bg-surface"
                                />
                              )}
                            </span>
                            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                              <span className="text-sm font-medium leading-tight text-text-primary">
                                {card.title}
                              </span>
                              {meta.length > 0 && (
                                <span className="text-xs text-text-secondary">{meta.join(" · ")}</span>
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
                              "flex animate-fade-in flex-col gap-2 rounded-xl border border-border bg-bg-surface px-3 py-2 transition-shadow motion-reduce:transition-none",
                              selected && "border-accent ring-2 ring-accent/50"
                            )}
                          >
                            {onSelectStop ? (
                              <button
                                type="button"
                                onClick={() => onSelectStop(selected ? null : id)}
                                aria-pressed={selected}
                                aria-label={interpolate(t.plan.detail.open, { title: card.title })}
                                data-stop-index={stop ? stopGlyph(stop) : undefined}
                                className="flex w-full items-center gap-3 rounded-lg text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
                              >
                                {body}
                              </button>
                            ) : (
                              <div className="flex w-full items-center gap-3 text-left">{body}</div>
                            )}
                            <div className="flex flex-wrap items-center gap-2">
                              {card.source && (
                                <a
                                  href={card.source_url || undefined}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  title={card.license || undefined}
                                  className="inline-flex w-fit items-center gap-1 rounded-full border border-border-soft px-2 py-0.5 text-[10px] uppercase tracking-wider text-text-secondary transition hover:border-accent/40 hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
                                >
                                  {interpolate(t.plan.card.source, { source: card.source })}
                                  <ExternalLink size={10} aria-hidden="true" />
                                </a>
                              )}
                              <span className="ml-auto flex shrink-0 items-center gap-1.5">
                                {onChange && (
                                  <button
                                    type="button"
                                    onClick={() => onChange({ day: day.day, part })}
                                    aria-label={`${p.change}: ${card.title}`}
                                    className="rounded-lg border border-border-soft px-2.5 py-1 text-xs text-text-secondary transition hover:border-accent/40 hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
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
