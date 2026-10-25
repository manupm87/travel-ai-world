"use client";

/** An activity's page in the trip panel: photo, article, contact and directions. */

import { useEffect, useRef } from "react";
import { ExternalLink, MapPin, Phone, Sparkles } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { useLanguage } from "@/context/LanguageContext";
import type { CardDetailStatus } from "@/hooks/useCardDetail";
import { interpolate } from "@/i18n";
import type { CardDetail, OptionCard, Slot } from "@/types/planner";
import { cn } from "@/utils/cn";

export interface ActivityDetailProps {
  /** The card as the itinerary holds it: always there, detail or not. */
  card: OptionCard;
  /** Its slot; the stay's pseudo-slot (`day: 0`) means "no day". */
  slot: Slot;
  /** The full card (`useCardDetail`), or `null` while there is none. */
  detail: CardDetail | null;
  status: CardDetailStatus;
  /** Back to the day: the back button, Escape, and after a removal. */
  onBack: () => void;
  /** Without them the activity is read only: no "Change", no "Remove". */
  onChange?: (slot: Slot) => void;
  onRemove?: (slot: Slot, cardId: string) => void;
}

/**
 * The itinerary's card with the full article merged over it.
 * The endpoint doesn't know the turn, so `why` stays the model's; without a corpus photo the
 * card keeps its own picture and credit together.
 */
export function mergeCardDetail(card: OptionCard, detail: CardDetail | null): OptionCard {
  if (!detail) return card;
  return {
    ...card,
    ...detail,
    why: card.why,
    ...(detail.image_url
      ? {}
      : { image_url: card.image_url, image_credit: card.image_credit }),
  };
}

/** The corpus separates paragraphs with a blank line. */
function paragraphsOf(description: string): string[] {
  return description
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph.length > 0);
}

/** Google Maps directions to a located card, or `null` without coordinates. */
export function directionsUrl(card: OptionCard): string | null {
  if (card.lat === null || card.lon === null) return null;
  return `https://www.google.com/maps/dir/?api=1&destination=${card.lat},${card.lon}`;
}

/**
 * One activity opened from the itinerary, in place of the day. The card shows at once; the
 * article and contact facts from `GET /planner/card` are added silently when they arrive.
 * Stateless: selection, fetch and mutations belong to `TripPanel` and the page.
 */
export function ActivityDetail({
  card,
  slot,
  detail,
  status,
  onBack,
  onChange,
  onRemove,
}: ActivityDetailProps) {
  const { t } = useLanguage();
  const p = t.plan.panel;
  const d = t.plan.detail;
  const isStay = slot.day === 0;
  const view = mergeCardDetail(card, detail);

  // the alternatives sheet also listens on `document`, where its stopPropagation can't stop
  // this earlier listener, so Escape is ignored while any modal dialog is open
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (document.querySelector('[role="dialog"][aria-modal="true"]')) return;
      onBack();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onBack]);

  // the row that opened this view unmounted with the day; without this, focus falls to <body>
  const backRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    backRef.current?.focus({ preventScroll: true });
  }, []);

  const chips = [
    view.district,
    t.plan.detail.categories[view.category] ?? (view.category || null),
    view.price_tier === null
      ? null
      : t.plan.priceTiers[String(view.price_tier) as "1" | "2" | "3"],
    view.hours,
    view.rating_text,
  ].filter((chip): chip is string => !!chip);

  const paragraphs = detail ? paragraphsOf(detail.description) : [];
  const directions = directionsUrl(view);

  const facts = detail
    ? [
        detail.address
          ? { key: "address", label: d.address, value: detail.address, href: null }
          : null,
        detail.phone
          ? {
              key: "phone",
              label: d.phone,
              value: detail.phone,
              href: `tel:${detail.phone.replace(/\s+/g, "")}`,
            }
          : null,
        detail.website
          ? { key: "website", label: d.website, value: detail.website, href: detail.website }
          : null,
      ].filter((fact): fact is NonNullable<typeof fact> => fact !== null)
    : [];

  return (
    <div data-activity-detail={card.id}>
      <Card className="flex animate-fade-up flex-col gap-4 overflow-hidden p-0">
        <div className="flex flex-col gap-3 px-4 pt-4">
          <button
            type="button"
            ref={backRef}
            onClick={onBack}
            className="inline-flex w-fit items-center gap-1.5 rounded-lg px-1 py-1 text-xs font-medium text-text-secondary transition hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
          >
            {isStay ? d.backToStay : interpolate(d.backToDay, { day: slot.day })}
          </button>
        </div>

        {view.image_url && (
          <figure className="m-0 flex flex-col gap-1">
            <div className="h-44 w-full overflow-hidden bg-bg-surface sm:h-56">
              {/* remote Wikimedia images on a static export: there is no image optimizer */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={view.image_url}
                alt={view.title}
                loading="lazy"
                className="h-full w-full object-cover"
              />
            </div>
            {view.image_credit && (
              <figcaption className="px-4 text-xs text-text-muted">
                {interpolate(t.plan.card.imageCredit, { credit: view.image_credit })}
              </figcaption>
            )}
          </figure>
        )}

        <div className="flex flex-col gap-3 px-4 pb-4">
          <h3 className="text-xl font-medium leading-tight text-text-primary">{view.title}</h3>
          {view.subtitle && <p className="text-sm text-text-secondary">{view.subtitle}</p>}

          {chips.length > 0 && (
            <ul className="flex flex-wrap items-center gap-1.5">
              {chips.map((chip) => (
                <li
                  key={chip}
                  className="rounded-full border border-border-soft px-2.5 py-0.5 text-xs text-text-secondary"
                >
                  {chip}
                </li>
              ))}
            </ul>
          )}

          {view.why && (
            <p className="flex items-start gap-1.5 text-sm leading-snug text-text-secondary">
              <Sparkles size={14} aria-hidden="true" className="mt-0.5 shrink-0 text-accent" />
              <span>{view.why}</span>
            </p>
          )}

          {status === "loading" && (
            <div
              role="status"
              aria-busy="true"
              aria-label={d.loading}
              className="flex flex-col gap-2"
            >
              {[0, 1, 2].map((line) => (
                <span
                  key={line}
                  aria-hidden="true"
                  className={cn(
                    "h-3 animate-pulse rounded-full bg-bg-surface motion-reduce:animate-none",
                    line === 2 ? "w-2/3" : "w-full"
                  )}
                />
              ))}
            </div>
          )}

          {paragraphs.length > 0 && (
            <section aria-label={d.about} className="flex flex-col gap-2">
              {paragraphs.map((paragraph) => (
                <p key={paragraph} className="text-sm leading-relaxed text-text-primary">
                  {paragraph}
                </p>
              ))}
            </section>
          )}

          {facts.length > 0 && (
            <dl className="flex flex-col gap-1.5 text-sm">
              {facts.map((fact) => (
                <div key={fact.key} className="flex flex-wrap items-baseline gap-x-2">
                  <dt className="text-xs font-medium uppercase tracking-wider text-text-secondary">
                    {fact.label}
                  </dt>
                  <dd className="min-w-0 flex-1 break-words text-text-primary">
                    {fact.href ? (
                      <a
                        href={fact.href}
                        {...(fact.key === "website"
                          ? { target: "_blank", rel: "noopener noreferrer" }
                          : {})}
                        className="inline-flex items-center gap-1 text-accent underline-offset-2 transition hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
                      >
                        {fact.key === "phone" && <Phone size={12} aria-hidden="true" />}
                        {fact.value}
                      </a>
                    ) : (
                      fact.value
                    )}
                  </dd>
                </div>
              ))}
            </dl>
          )}

          <div className="flex flex-wrap items-center gap-2 border-t border-border-soft pt-3">
            {directions && (
              <a
                href={directions}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg border border-border-soft px-2.5 py-1 text-xs text-text-secondary transition hover:border-accent/40 hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
              >
                <MapPin size={12} aria-hidden="true" />
                {d.directions}
              </a>
            )}
            {view.source && (
              <a
                href={view.source_url || undefined}
                target="_blank"
                rel="noopener noreferrer"
                title={view.license || undefined}
                className="inline-flex items-center gap-1 rounded-full border border-border-soft px-2 py-0.5 text-xs uppercase tracking-wider text-text-secondary transition hover:border-accent/40 hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
              >
                {interpolate(t.plan.card.source, { source: view.source })}
                <ExternalLink size={10} aria-hidden="true" />
              </a>
            )}
            {view.license && <span className="text-xs text-text-muted">{view.license}</span>}

            <span className="ml-auto flex items-center gap-1.5">
              {onChange && (
                <button
                  type="button"
                  onClick={() => onChange(slot)}
                  aria-label={`${p.change}: ${view.title}`}
                  className="rounded-lg border border-border-soft px-2.5 py-1 text-xs text-text-secondary transition hover:border-accent/40 hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
                >
                  {p.change}
                </button>
              )}
              {!isStay && onRemove && (
                <button
                  type="button"
                  onClick={() => onRemove(slot, card.id)}
                  aria-label={`${p.remove}: ${view.title}`}
                  className="rounded-lg px-2.5 py-1 text-xs text-text-secondary transition hover:text-error focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
                >
                  {p.remove}
                </button>
              )}
            </span>
          </div>
          </div>
      </Card>
    </div>
  );
}
