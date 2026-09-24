/**
 * The itinerary's dates: the brief gives a start and an end, every day of the
 * draft is an offset from the start. Shared by `TripPanel` (the day it shows),
 * `DayStrip` (the date on every chip) and `services/trips.ts` (the date every
 * saved itinerary day carries), so all three date a day the same way.
 */

const MS_PER_DAY = 86_400_000;

/** How a day's date reads on a chip or a day header. */
export const DATE_OPTIONS: Intl.DateTimeFormatOptions = {
  weekday: "short",
  day: "numeric",
  month: "short",
  timeZone: "UTC",
};

/** `YYYY-MM-DD` at UTC midnight, so no timezone can shift a day. */
export function parseIsoDate(iso: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return null;
  return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

/** The ISO date of day `day` (1-based) of a trip starting on `start`. */
export function dateForDay(start: string | null, day: number): string | null {
  if (!start) return null;
  const base = parseIsoDate(start);
  if (base === null) return null;
  return new Date(base + (day - 1) * MS_PER_DAY).toISOString().slice(0, 10);
}

/** Nights + 1, from the brief's dates; `null` when they are not both known. */
export function daysBetween(start: string | null, end: string | null): number | null {
  if (!start || !end) return null;
  const from = parseIsoDate(start);
  const to = parseIsoDate(end);
  if (from === null || to === null || to < from) return null;
  return Math.round((to - from) / MS_PER_DAY) + 1;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** A day in the reader's own calendar, as the `YYYY-MM-DD` a brief carries. */
function isoOf(day: Date): string {
  return `${day.getFullYear()}-${pad(day.getMonth() + 1)}-${pad(day.getDate())}`;
}

/** Today, in the reader's calendar. */
export function todayIso(): string {
  return isoOf(new Date());
}

/**
 * The first day a trip can start (TRA-244): tomorrow. A trip that starts
 * today is already ongoing, which core_api locks (ADR 0019).
 */
export function tomorrowIso(): string {
  const day = new Date();
  day.setDate(day.getDate() + 1);
  return isoOf(day);
}
