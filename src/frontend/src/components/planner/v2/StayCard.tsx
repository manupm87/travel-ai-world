"use client";

import { ExternalLink, Sparkles } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { useLanguage } from "@/context/LanguageContext";
import { interpolate } from "@/i18n";
import type { OptionCard } from "@/types/planner";
import { cn } from "@/utils/cn";
import { stayStopId, stopGlyph, type MapStop } from "./mapStops";

export interface StayCardProps {
  stay: OptionCard;
  /** From the brief; `null` hides the night count in the eyebrow. */
  nights: number | null;
  /** The stay's pin (`toMapStops`), or `null` when it has no coordinates. */
  stop?: MapStop | null;
  /** The selected stop, `null` for none; the same id scheme as the map. */
  selectedStopId?: string | null;
  /** Without it the card is plain text: nothing to select, no detail to open. */
  onSelectStop?: (id: string | null) => void;
  /** Without it the card offers no way to change the stay: a locked trip. */
  onChange?: () => void;
}

/**
 * The hotel the itinerary sleeps in: a button like any stop of a day (TRA-179)
 * — it selects the stay, highlights its "H" pin and opens its detail in this
 * column — with the source and the way back to the alternatives beneath it.
 */
export function StayCard({
  stay,
  nights,
  stop = null,
  selectedStopId = null,
  onSelectStop,
  onChange,
}: StayCardProps) {
  const { t } = useLanguage();
  const p = t.plan.panel;
  const id = stayStopId(stay.id);
  const selected = id === selectedStopId;

  const meta = [
    stay.district,
    stay.price_tier === null
      ? null
      : t.plan.priceTiers[String(stay.price_tier) as "1" | "2" | "3"],
  ].filter((part): part is string => !!part);

  // Everything above the footer is the button; the source link and "Change"
  // are links and buttons of their own, so they cannot be nested inside it.
  const body = (
    <>
      <span className="h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-bg-surface">
        {stay.image_url ? (
          // Remote Wikimedia images on a static export: no optimizer to route them through.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={stay.image_url}
            alt={stay.title}
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

      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-text-secondary">
          {stop && (
            <span
              aria-hidden="true"
              className={cn(
                "flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold transition",
                selected ? "bg-gold text-white" : "bg-accent-soft text-text-primary"
              )}
            >
              {stopGlyph(stop)}
            </span>
          )}
          {nights === null ? p.stayNoNights : interpolate(p.stay, { nights })}
        </span>
        <span className="text-[15px] font-medium leading-tight text-text-primary">
          {stay.title}
        </span>
        {meta.length > 0 && <span className="text-xs text-text-secondary">{meta.join(" · ")}</span>}
        {stay.why && (
          <span className="flex items-start gap-1.5 text-xs leading-snug text-text-secondary">
            <Sparkles size={12} aria-hidden="true" className="mt-0.5 shrink-0 text-accent" />
            <span>{stay.why}</span>
          </span>
        )}
      </span>
    </>
  );

  return (
    <div data-stop-row={id} data-selected={selected}>
      <Card
        className={cn(
          "flex animate-fade-up flex-col gap-2 p-3 transition-shadow motion-reduce:transition-none",
          selected && "border-accent ring-2 ring-accent/50"
        )}
      >
        {onSelectStop ? (
          <button
            type="button"
            onClick={() => onSelectStop(selected ? null : id)}
            aria-pressed={selected}
            aria-label={interpolate(t.plan.detail.open, { title: stay.title })}
            data-stop-index={stop ? stopGlyph(stop) : undefined}
            className="flex w-full items-start gap-3 rounded-xl text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
          >
            {body}
          </button>
        ) : (
          <div className="flex w-full items-start gap-3 text-left">{body}</div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          {stay.source && (
            <a
              href={stay.source_url || undefined}
              target="_blank"
              rel="noopener noreferrer"
              title={stay.license || undefined}
              className="inline-flex w-fit items-center gap-1 rounded-full border border-border-soft px-2 py-0.5 text-[10px] uppercase tracking-wider text-text-secondary transition hover:border-accent/40 hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
            >
              {interpolate(t.plan.card.source, { source: stay.source })}
              <ExternalLink size={10} aria-hidden="true" />
            </a>
          )}
          {onChange && (
            <button
              type="button"
              onClick={onChange}
              aria-label={`${p.change}: ${stay.title}`}
              className="ml-auto shrink-0 rounded-lg border border-border-soft px-2.5 py-1 text-xs text-text-secondary transition hover:border-accent/40 hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
            >
              {p.change}
            </button>
          )}
        </div>
      </Card>
    </div>
  );
}
