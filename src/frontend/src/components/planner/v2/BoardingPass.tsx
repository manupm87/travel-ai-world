"use client";

import { Plane } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { interpolate } from "@/i18n";
import { useFormatters } from "@/hooks/useFormatters";
import type { ItineraryDraft } from "@/hooks/plannerReducer";
import { Kiri } from "@/components/kiri/Kiri";
import { DAY_PARTS, type TripBrief } from "@/types/planner";

const DAY_MONTH: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", timeZone: "UTC" };

/** The barcode's bars: a fixed pattern, only there to read as a ticket. */
const BARS = [2, 1, 1, 3, 1, 2, 1, 1, 2, 3, 1, 1, 2, 1, 3, 1, 2, 1, 1, 2];

export interface BoardingPassProps {
  brief: TripBrief;
  itinerary: ItineraryDraft;
}

/**
 * What the closed suitcase turns into (TRA-239): the trip as a boarding pass.
 * From where to where, the dates, the travellers, how many days and stops,
 * and on the stub a happy Kiri and the first gate — day 1. Everything on it is
 * already in the brief and the itinerary; the barcode is decoration.
 */
export function BoardingPass({ brief, itinerary }: BoardingPassProps) {
  const { t } = useLanguage();
  const { formatDate } = useFormatters();
  const p = t.plan.packing.boarding;
  const c = t.plan.checklist;

  const days = itinerary.days.length;
  const stops = itinerary.days.reduce(
    (total, day) => total + DAY_PARTS.reduce((sum, part) => sum + day.slots[part].length, 0),
    0
  );
  const dates =
    brief.start_date && brief.end_date
      ? interpolate(t.plan.trips.dateRange, {
          start: formatDate(brief.start_date, DAY_MONTH),
          end: formatDate(brief.end_date, DAY_MONTH),
        })
      : null;
  const travellers =
    brief.adults === null
      ? null
      : brief.children
        ? interpolate(c.adultsAndChildren, { adults: brief.adults, children: brief.children })
        : interpolate(c.adults, { adults: brief.adults });

  const fields = [
    { label: p.dates, value: dates },
    { label: p.travellers, value: travellers },
    { label: p.days, value: days > 0 ? String(days) : null },
    { label: p.stops, value: stops > 0 ? String(stops) : null },
  ].filter((field) => field.value !== null);

  return (
    <section
      aria-label={p.title}
      className="relative flex overflow-hidden rounded-2xl border border-glass-border bg-bg-card"
    >
      <div className="flex min-w-0 flex-1 flex-col gap-2.5 px-4 py-3.5">
        <span className="text-[11.5px] text-text-muted">{p.title}</span>
        <p className="flex flex-wrap items-center gap-x-2.5 font-heading text-[22px] leading-tight text-text-primary">
          {brief.origin && (
            <>
              <span>{brief.origin}</span>
              <Plane size={16} aria-hidden="true" className="text-accent" />
            </>
          )}
          <span>{brief.destination}</span>
        </p>
        {fields.length > 0 && (
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
            {fields.map((field) => (
              <div key={field.label} className="flex min-w-0 flex-col">
                <dt className="text-[11px] text-text-muted">{field.label}</dt>
                <dd className="truncate text-[13.5px] font-semibold text-text-primary">{field.value}</dd>
              </div>
            ))}
          </dl>
        )}
      </div>

      {/* The stub, torn along a dashed line with a notch at each end. */}
      <div
        aria-hidden="true"
        className="relative flex w-[92px] shrink-0 flex-col items-center justify-center gap-2 border-l border-dashed border-glass-border px-2 py-3"
      >
        <span className="absolute -top-2 -left-2 h-4 w-4 rounded-full bg-bg-primary" />
        <span className="absolute -bottom-2 -left-2 h-4 w-4 rounded-full bg-bg-primary" />
        <Kiri state="happy" scale={2} />
        <span className="font-pixel text-[11px] text-text-secondary">
          {interpolate(p.gate, { day: 1 })}
        </span>
        <span className="flex h-6 items-stretch gap-[2px]">
          {BARS.map((width, index) => (
            <span key={index} className="bg-text-secondary" style={{ width }} />
          ))}
        </span>
      </div>
    </section>
  );
}
