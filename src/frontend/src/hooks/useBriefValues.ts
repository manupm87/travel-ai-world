"use client";

import { useLanguage } from "@/context/LanguageContext";
import { useFormatters } from "@/hooks/useFormatters";
import { interpolate } from "@/i18n";
import type { BriefField, TripBrief } from "@/types/planner";

const DAY_MONTH: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", timeZone: "UTC" };

/**
 * Each field of the brief as the reader reads it — "Oct 23 – Oct 25 · 2 nights",
 * "2 adults", "Food, Thermal baths" — or `null` while the chat has not answered
 * it. One reading for the panel's checklist and Kiri's luggage tag (TRA-239).
 */
export function useBriefValues(brief: TripBrief): Record<BriefField, string | null> {
  const { t } = useLanguage();
  const { formatDate } = useFormatters();
  const c = t.plan.checklist;

  const dates = (): string | null => {
    if (!brief.start_date || !brief.end_date) return null;
    const range = `${formatDate(brief.start_date, DAY_MONTH)} – ${formatDate(brief.end_date, DAY_MONTH)}`;
    return brief.nights === null
      ? range
      : `${range} · ${brief.nights === 1 ? c.nightOne : interpolate(c.nights, { nights: brief.nights })}`;
  };

  const travellers = (): string | null => {
    if (brief.adults === null) return null;
    return brief.children
      ? interpolate(c.adultsAndChildren, { adults: brief.adults, children: brief.children })
      : interpolate(c.adults, { adults: brief.adults });
  };

  return {
    destination: brief.destination,
    origin: brief.origin,
    dates: dates(),
    travellers: travellers(),
    interests:
      brief.interests.length > 0
        ? brief.interests
            .map((id) => t.plan.quickReplies.interestOptions.find((o) => o.id === id)?.label ?? id)
            .join(", ")
        : null,
  };
}
