"use client";

import { Check, ExternalLink, Heart, Sparkles } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { interpolate } from "@/i18n";
import type { OptionCard as OptionCardData, SelectionMode, Slot } from "@/types/planner";
import { cn } from "@/utils/cn";

export interface OptionCardProps {
  card: OptionCardData;
  /** Where a pick lands; changes the primary button's label. */
  slot?: Slot | null;
  /** `multi` turns the primary action into a checkbox; the carousel adds the "Add N" footer. */
  selection?: SelectionMode;
  /** Already chosen (single) or checked (multi). */
  selected?: boolean;
  /** Already in the itinerary slot the sheet is changing: not selectable again. */
  current?: boolean;
  shortlisted?: boolean;
  /** A turn is streaming: the choice buttons wait. */
  disabled?: boolean;
  onChoose: () => void;
  onDismiss?: () => void;
  onToggleShortlist?: () => void;
  className?: string;
}

/**
 * One option from the corpus: image, title, district, price tier
 * (`€`/`€€`/`€€€`, never a number), hours, the assistant's one-line "why",
 * the source it was hydrated from, and the choice buttons. Purely
 * presentational: the carousel or the sheet decides what a choice means.
 */
export function OptionCard({
  card,
  slot = null,
  selection = "single",
  selected = false,
  current = false,
  shortlisted = false,
  disabled = false,
  onChoose,
  onDismiss,
  onToggleShortlist,
  className,
}: OptionCardProps) {
  const { t } = useLanguage();
  const p = t.plan;

  const meta = [
    card.district,
    card.hours,
    card.price_tier === null ? null : p.priceTiers[String(card.price_tier) as "1" | "2" | "3"],
  ].filter((part): part is string => !!part);

  const primaryLabel = current
    ? p.card.alreadyInDay
    : selected && selection === "single"
      ? p.card.chosen
      : slot
        ? interpolate(p.card.addToSlot, { day: slot.day, part: p.parts[slot.part ?? "morning"] })
        : p.card.choose;

  const primaryDisabled = disabled || current || (selected && selection === "single");

  return (
    <article
      data-card-id={card.id}
      data-selected={selected || undefined}
      aria-label={card.title}
      className={cn(
        "flex w-[260px] shrink-0 snap-start flex-col overflow-hidden rounded-2xl border bg-bg-card text-left transition-colors",
        selected ? "border-accent shadow-accent-glow" : "border-border",
        className
      )}
    >
      <div className="relative h-32 w-full bg-bg-surface">
        {card.image_url ? (
          // Remote Wikimedia images on a static export: no optimizer to route them through.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={card.image_url}
            alt={card.title}
            title={card.image_credit ? interpolate(p.card.imageCredit, { credit: card.image_credit }) : undefined}
            loading="lazy"
            className="h-full w-full object-cover"
          />
        ) : (
          <div
            aria-hidden="true"
            className="h-full w-full bg-gradient-to-br from-accent/30 via-purple/20 to-bg-surface"
          />
        )}
        {selected && (
          <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-accent px-2 py-0.5 text-[11px] font-medium text-white">
            <Check size={12} aria-hidden="true" />
            {p.card.chosen}
          </span>
        )}
        {current && (
          <span className="absolute left-2 top-2 rounded-full bg-bg-primary/80 px-2 py-0.5 text-[11px] font-medium text-text-primary">
            {p.alternatives.current}
          </span>
        )}
        {onToggleShortlist && (
          <button
            type="button"
            onClick={onToggleShortlist}
            aria-pressed={shortlisted}
            aria-label={shortlisted ? p.card.unshortlist : p.card.shortlist}
            className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-bg-primary/80 text-text-primary transition hover:text-error focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
          >
            <Heart
              size={14}
              aria-hidden="true"
              className={cn(shortlisted && "fill-error text-error")}
            />
          </button>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-2 p-3.5">
        <div className="flex flex-col gap-0.5">
          <h4 className="text-[15px] font-medium leading-tight text-text-primary">{card.title}</h4>
          {(card.subtitle || meta.length > 0) && (
            <p className="text-xs text-text-secondary">
              {[card.subtitle, ...meta].filter(Boolean).join(" · ")}
            </p>
          )}
        </div>

        {card.why && (
          <p className="flex items-start gap-1.5 text-xs leading-snug text-text-secondary">
            <Sparkles size={12} aria-hidden="true" className="mt-0.5 shrink-0 text-accent" />
            <span>{card.why}</span>
          </p>
        )}

        {card.source && (
          <a
            href={card.source_url || undefined}
            target="_blank"
            rel="noopener noreferrer"
            title={card.license || undefined}
            className="inline-flex w-fit items-center gap-1 rounded-full border border-border-soft px-2 py-0.5 text-[10px] uppercase tracking-wider text-text-secondary transition hover:border-accent/40 hover:text-text-primary"
          >
            {interpolate(p.card.source, { source: card.source })}
            <ExternalLink size={10} aria-hidden="true" />
          </a>
        )}

        <div className="mt-auto flex flex-col gap-1.5 pt-1">
          {selection === "multi" ? (
            <button
              type="button"
              role="checkbox"
              aria-checked={selected}
              disabled={disabled || current}
              onClick={onChoose}
              className={cn(
                "inline-flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-[13px] font-medium transition disabled:cursor-not-allowed disabled:opacity-50",
                selected
                  ? "border-accent bg-accent text-white"
                  : "border-border-soft bg-transparent text-text-primary hover:border-accent/50"
              )}
            >
              <Check size={14} aria-hidden="true" className={cn(!selected && "opacity-30")} />
              {current ? p.card.alreadyInDay : primaryLabel}
            </button>
          ) : (
            <button
              type="button"
              disabled={primaryDisabled}
              onClick={onChoose}
              className={cn(
                "inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-[13px] font-medium transition disabled:cursor-not-allowed",
                selected || current
                  ? "border border-border-soft bg-transparent text-text-secondary disabled:opacity-100"
                  : "bg-accent text-white hover:bg-accent-hover disabled:opacity-50"
              )}
            >
              {primaryLabel}
            </button>
          )}
          {onDismiss && !selected && !current && (
            <button
              type="button"
              onClick={onDismiss}
              disabled={disabled}
              className="rounded-lg px-3 py-1.5 text-xs text-text-secondary transition hover:text-text-primary disabled:opacity-50"
            >
              {p.card.notInterested}
            </button>
          )}
        </div>
      </div>
    </article>
  );
}
