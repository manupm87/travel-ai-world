"use client";

/** The whole-trip overview: the destination, the trip's photos and its days. */

import { ExternalLink } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { useFormatters } from "@/hooks/useFormatters";
import { interpolate } from "@/i18n";
import type { DayDraft, ItineraryDraft } from "@/hooks/plannerReducer";
import { DAY_PARTS, type OptionCard, type PlannerCity, type TripBrief } from "@/types/planner";
import { DATE_OPTIONS, dateForDay } from "@/utils/tripDates";
import { WarningBadge } from "./WarningBadge";

export interface TripOverviewProps {
  itinerary: ItineraryDraft;
  brief: TripBrief;
  /** The destination as `ai_api` publishes it; `null` without a backend, in demo mode or outside the manifest. */
  city: PlannerCity | null;
  onSelectDay: (day: number) => void;
}

/** One photo of the trip: where it comes from decides its `alt` and its credit. */
interface Photo {
  url: string;
  title: string;
  credit: string | null;
}

/** Every card of the itinerary in reading order: the stay, then day by day. */
function cardsOf(itinerary: ItineraryDraft): OptionCard[] {
  const cards: OptionCard[] = itinerary.stay ? [itinerary.stay] : [];
  for (const day of itinerary.days) cards.push(...cardsOfDay(day));
  return cards;
}

/** One day's cards, in slot order. */
function cardsOfDay(day: DayDraft): OptionCard[] {
  return DAY_PARTS.flatMap((part) => day.slots[part]);
}

/** The trip's own photos, in itinerary order and without repeats. */
function photosOf(itinerary: ItineraryDraft): Photo[] {
  const seen = new Set<string>();
  const photos: Photo[] = [];
  for (const card of cardsOf(itinerary)) {
    if (!card.image_url || seen.has(card.image_url)) continue;
    seen.add(card.image_url);
    photos.push({ url: card.image_url, title: card.title, credit: card.image_credit });
  }
  return photos;
}

/**
 * The whole trip at a glance, shown while no day is selected: the destination's
 * photo and intro, a mosaic of the chosen places and the list of days, each row
 * opening its day.
 */
export function TripOverview({ itinerary, brief, city, onSelectDay }: TripOverviewProps) {
  const { t, language } = useLanguage();
  const { formatDate } = useFormatters();
  const p = t.plan.panel;

  // the city's own name, so a brief saying "budapest" or "Budapest, Hungary" reads "About Budapest"
  const destination = city?.name ?? brief.destination ?? "";

  // the reader's language, else English; with neither there is no "About"
  const intro = city ? (city.intro[language] ?? city.intro.en ?? null) : null;
  const paragraphs = intro
    ? intro.text
        .split(/\n\s*\n/)
        .map((paragraph) => paragraph.trim())
        .filter(Boolean)
    : [];

  const photos = photosOf(itinerary);
  const cityImage = city?.image_url ?? null;
  // without a city photo the trip's first place leads, and leaves the mosaic
  const hero: Photo | null = cityImage
    ? { url: cityImage, title: city?.name ?? destination, credit: city?.image_credit ?? null }
    : (photos[0] ?? null);
  const mosaic = photos.filter((photo) => photo.url !== hero?.url).slice(0, 6);

  return (
    <div className="flex flex-col gap-5">
      {hero && (
        <figure className="flex animate-fade-up flex-col gap-1">
          {/* remote Wikimedia images on a static export: no optimizer to route them through */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={hero.url}
            alt=""
            data-trip-hero
            className="aspect-[16/9] w-full rounded-2xl object-cover lg:aspect-[16/7]"
          />
          {hero.credit && (
            <figcaption className="text-xs text-text-secondary">
              {interpolate(t.plan.card.imageCredit, { credit: hero.credit })}
            </figcaption>
          )}
        </figure>
      )}

      {paragraphs.length > 0 && intro && (
        <section className="flex animate-fade-up flex-col gap-2">
          <h3 className="text-sm font-medium text-text-primary">
            {interpolate(p.about, { destination })}
          </h3>
          <div className="flex flex-col gap-2 text-sm leading-relaxed text-text-secondary">
            {paragraphs.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
          </div>
          <a
            href={intro.source_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex w-fit items-center gap-1 rounded-full border border-border-soft px-2 py-0.5 text-xs uppercase tracking-wider text-text-secondary transition hover:border-accent/40 hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
          >
            {p.introCredit}
            <ExternalLink size={10} aria-hidden="true" />
          </a>
        </section>
      )}

      {mosaic.length > 0 && (
        <ul
          aria-label={interpolate(p.photos, { destination })}
          className="grid animate-fade-up grid-cols-2 gap-2 lg:grid-cols-3"
        >
          {mosaic.map((photo) => (
            <li key={photo.url} className="overflow-hidden rounded-xl bg-bg-surface">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={photo.url}
                alt={photo.title}
                loading="lazy"
                title={
                  photo.credit
                    ? interpolate(t.plan.card.imageCredit, { credit: photo.credit })
                    : undefined
                }
                className="aspect-[4/3] w-full object-cover"
              />
            </li>
          ))}
        </ul>
      )}

      <ul aria-label={p.dayList} className="flex animate-fade-up flex-col gap-2">
        {itinerary.days.map((day) => {
          const date = dateForDay(brief.start_date, day.day);
          const cards = cardsOfDay(day);
          const count = cards.length;
          const thumbnails = cards.filter((card) => card.image_url).slice(0, 4);
          const warnings = itinerary.warnings.filter(
            (warning) => warning.slot !== null && warning.slot.day === day.day
          );

          return (
            <li key={day.day} className="flex flex-col gap-1">
              {/* the row is the button itself: a `Card`'s <div> inside a <button> is invalid HTML */}
              <button
                type="button"
                onClick={() => onSelectDay(day.day)}
                className="flex w-full items-center gap-3 rounded-2xl border border-border bg-bg-card p-3 text-left transition hover:border-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
              >
                {/* no `aria-label` on the row: it would hide the title, the date and the count */}
                <span className="sr-only">{interpolate(p.openDay, { day: day.day })}</span>

                <span
                  aria-hidden="true"
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-soft text-sm font-medium text-text-primary"
                >
                  {day.day}
                </span>

                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="text-xs font-medium uppercase tracking-wider text-text-secondary">
                    {interpolate(p.day, { day: day.day })}
                  </span>
                  {day.title && (
                    <span className="truncate text-[15px] font-medium leading-tight text-text-primary">
                      {day.title}
                    </span>
                  )}
                  <span className="flex flex-wrap items-center gap-x-1.5 text-xs text-text-secondary">
                    {date && <span>{formatDate(date, DATE_OPTIONS)}</span>}
                    {day.weather && (
                      <>
                        {date && <span aria-hidden="true">·</span>}
                        <span>{day.weather.summary}</span>
                        {day.weather.t_max !== null && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span>{`${day.weather.t_max} °C`}</span>
                          </>
                        )}
                      </>
                    )}
                    <span aria-hidden="true">·</span>
                    <span>
                      {count === 1 ? p.experienceOne : interpolate(p.experiences, { count })}
                    </span>
                  </span>
                </span>

                {thumbnails.length > 0 && (
                  <span aria-hidden="true" className="hidden shrink-0 gap-1 sm:flex">
                    {thumbnails.map((card) => (
                      <span
                        key={card.id}
                        className="h-10 w-10 overflow-hidden rounded-lg bg-bg-surface"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={card.image_url ?? ""}
                          alt=""
                          loading="lazy"
                          className="h-full w-full object-cover"
                        />
                      </span>
                    ))}
                  </span>
                )}
              </button>

              {warnings.map((warning) => (
                <WarningBadge key={`${warning.code}:${warning.message}`} warning={warning} />
              ))}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
