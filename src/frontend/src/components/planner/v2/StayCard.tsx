"use client";

import { ExternalLink, Sparkles } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { useLanguage } from "@/context/LanguageContext";
import { interpolate } from "@/i18n";
import type { OptionCard } from "@/types/planner";

export interface StayCardProps {
  stay: OptionCard;
  /** From the brief; `null` hides the night count in the eyebrow. */
  nights: number | null;
  onChange: () => void;
}

/** The hotel the itinerary sleeps in, with a way back to the alternatives. */
export function StayCard({ stay, nights, onChange }: StayCardProps) {
  const { t } = useLanguage();
  const p = t.plan.panel;

  const meta = [
    stay.district,
    stay.price_tier === null
      ? null
      : t.plan.priceTiers[String(stay.price_tier) as "1" | "2" | "3"],
  ].filter((part): part is string => !!part);

  return (
    <Card className="flex gap-3 p-3">
      <div className="h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-bg-surface">
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
          <div
            aria-hidden="true"
            className="h-full w-full bg-gradient-to-br from-accent/30 via-purple/20 to-bg-surface"
          />
        )}
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="text-[10px] font-medium uppercase tracking-wider text-text-secondary">
          {nights === null ? p.stayNoNights : interpolate(p.stay, { nights })}
        </span>
        <h3 className="text-[15px] font-medium leading-tight text-text-primary">{stay.title}</h3>
        {meta.length > 0 && <p className="text-xs text-text-secondary">{meta.join(" · ")}</p>}
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
        {stay.why && (
          <p className="flex items-start gap-1.5 text-xs leading-snug text-text-secondary">
            <Sparkles size={12} aria-hidden="true" className="mt-0.5 shrink-0 text-accent" />
            <span>{stay.why}</span>
          </p>
        )}
      </div>

      <button
        type="button"
        onClick={onChange}
        aria-label={`${p.change}: ${stay.title}`}
        className="h-fit shrink-0 rounded-lg border border-border-soft px-2.5 py-1 text-xs text-text-secondary transition hover:border-accent/40 hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
      >
        {p.change}
      </button>
    </Card>
  );
}
