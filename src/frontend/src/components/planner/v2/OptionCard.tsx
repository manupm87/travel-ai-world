"use client";

import { useRef, useState } from "react";
import { Check, ExternalLink, Heart, Sparkles } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { interpolate } from "@/i18n";
import type { ItineraryDraft } from "@/hooks/plannerReducer";
import type { OptionCard as OptionCardData, SelectionMode, Slot } from "@/types/planner";
import { cn } from "@/utils/cn";
import { SlotPicker } from "./SlotPicker";

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
  /** Position in its carousel: staggers the entrance by 70 ms per card. */
  index?: number;
  /**
   * An unplaced card (`slot === null`): the itinerary whose days the traveller
   * picks from (TRA-185). With it the primary button opens the picker and
   * `onChoose` is called with the slot chosen; without it, nothing changes.
   */
  pickSlot?: ItineraryDraft | null;
  onChoose: (slot?: Slot) => void;
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
  index = 0,
  pickSlot = null,
  onChoose,
  onDismiss,
  onToggleShortlist,
  className,
}: OptionCardProps) {
  const { t } = useLanguage();
  const [image, setImage] = useState<"loading" | "loaded" | "error">("loading");
  const [picking, setPicking] = useState(false);
  const primaryRef = useRef<HTMLButtonElement>(null);
  const p = t.plan;

  // Unplaced, and there is an itinerary to place it in: the primary button
  // opens the picker instead of adding the card straight away.
  const days = pickSlot?.days.map((day) => day.day) ?? [];
  const canPick = slot === null && !!pickSlot && days.length > 0;

  /** Closes the picker and hands the focus back to the button that opened it. */
  const closePicker = () => {
    setPicking(false);
    primaryRef.current?.focus();
  };

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
        : canPick
          ? p.card.addToTrip
          : p.card.choose;

  const primaryDisabled = disabled || current || (selected && selection === "single");

  // The gradient block is both the "no image" state and the placeholder under a
  // loading one; an image that fails to load falls back to it for good.
  const hasImage = !!card.image_url && image !== "error";
  // The credit is the photo's own: the document's licence is not the image's
  // (a Commons credit carries its licence, a site preview has none).
  const creditText = card.image_credit
    ? interpolate(p.card.imageCredit, { credit: card.image_credit })
    : null;

  return (
    <article
      data-card-id={card.id}
      data-selected={selected || undefined}
      aria-label={card.title}
      style={{ animationDelay: `${index * 70}ms` }}
      className={cn(
        "group flex w-[260px] shrink-0 snap-start flex-col overflow-hidden rounded-2xl border bg-bg-card text-left",
        "animate-fade-up transition-[border-color,box-shadow] duration-300 motion-reduce:transition-none",
        selected ? "border-accent shadow-accent-glow" : "border-border",
        className
      )}
    >
      <div className="relative h-32 w-full overflow-hidden bg-bg-surface">
        {(!hasImage || image === "loading") && (
          <div
            aria-hidden="true"
            className="absolute inset-0 bg-gradient-to-br from-accent/30 via-purple/20 to-bg-surface"
          >
            {hasImage && (
              <div className="h-full w-full animate-shimmer bg-gradient-to-r from-transparent via-white/10 to-transparent bg-[length:200%_100%]" />
            )}
          </div>
        )}
        {hasImage && (
          // Remote Wikimedia images on a static export: no optimizer to route them through.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={card.image_url ?? undefined}
            alt={card.title}
            title={creditText ?? undefined}
            loading="lazy"
            onLoad={() => setImage("loaded")}
            onError={() => setImage("error")}
            className={cn(
              "relative h-full w-full object-cover transition-opacity duration-500 motion-reduce:transition-none",
              image === "loaded" ? "opacity-100" : "opacity-0"
            )}
          />
        )}
        {hasImage && creditText && (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 bottom-0 truncate bg-bg-primary/75 px-2 py-1 text-[10px] leading-tight text-text-secondary opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-within:opacity-100 motion-reduce:transition-none"
          >
            {creditText}
          </span>
        )}
        {selected && (
          <span className="absolute left-2 top-2 inline-flex animate-scale-in items-center gap-1 rounded-full bg-action px-2 py-0.5 text-[11px] font-medium text-on-action">
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
              onClick={() => onChoose()}
              className={cn(
                "inline-flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-[13px] font-medium transition disabled:cursor-not-allowed disabled:opacity-50",
                selected
                  ? "border-accent bg-action text-on-action"
                  : "border-border-soft bg-transparent text-text-primary hover:border-accent/50"
              )}
            >
              <Check size={14} aria-hidden="true" className={cn(!selected && "opacity-30")} />
              {current ? p.card.alreadyInDay : primaryLabel}
            </button>
          ) : (
            <button
              ref={primaryRef}
              type="button"
              disabled={primaryDisabled}
              aria-expanded={canPick ? picking : undefined}
              onClick={canPick ? () => setPicking((open) => !open) : () => onChoose()}
              className={cn(
                "inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-[13px] font-medium transition disabled:cursor-not-allowed",
                selected || current
                  ? "border border-border-soft bg-transparent text-text-secondary disabled:opacity-100"
                  : "bg-action text-on-action hover:bg-accent-hover disabled:opacity-50"
              )}
            >
              {primaryLabel}
            </button>
          )}
          {canPick && picking && pickSlot && (
            <SlotPicker
              days={days}
              itinerary={pickSlot}
              onPick={(chosen) => {
                closePicker();
                onChoose(chosen);
              }}
              onCancel={closePicker}
            />
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
