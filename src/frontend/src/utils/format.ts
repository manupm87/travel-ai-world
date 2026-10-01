/**
 * Locale-aware date formatting.
 * @param dateStr - ISO date string
 * @param locale - BCP47 locale (e.g., "en-US", "es-ES")
 * @param options - Intl.DateTimeFormat options
 */
export function formatDate(
  dateStr: string,
  locale = "en-US",
  options: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", year: "numeric" }
): string {
  return new Date(dateStr).toLocaleDateString(locale, options);
}

/**
 * Locale-aware currency formatting.
 */
export function formatCurrency(
  amount: number,
  currency: string,
  locale = "en-US"
): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

/**
 * Formats duration in minutes to "Xh Ym" or "Xm" format.
 */
export function formatDuration(minutes: number): string {
  if (isNaN(minutes) || minutes === 0) return "0m";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  return `${m}m`;
}

/** The local time of an ISO timestamp as `HH:mm:ss` (24 h, whatever the locale). */
export function formatTime(iso: string, locale = "en-US"): string {
  return new Date(iso).toLocaleTimeString(locale, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
}

/**
 * The weekday, hour and minute of an ISO timestamp in the viewer's own time
 * zone, the locale's way ("Fri 2:00 AM", "vie, 2:00"); `""` when it is not a
 * date. For a moment that may fall on another day than today: a time alone
 * would not say which.
 */
export function formatWeekdayTime(iso: string, locale = "en-US"): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(locale, {
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

/** A plain count with the locale's grouping ("12,345" / "12.345"). */
export function formatNumber(n: number, locale = "en-US"): string {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(n);
}

/**
 * A duration in milliseconds, the way a latency reads: "640 ms" under a
 * second, "1.2 s" (one decimal) from there on.
 */
export function formatMs(ms: number, locale = "en-US"): string {
  if (ms < 1000) {
    return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(ms)} ms`;
  }
  const seconds = new Intl.NumberFormat(locale, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(ms / 1000);
  return `${seconds} s`;
}

/** US dollars with two decimals, or four when the amount is under a cent. */
export function formatUsd(n: number, locale = "en-US"): string {
  const digits = n !== 0 && Math.abs(n) < 0.01 ? 4 : 2;
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(n);
}

/**
 * A ratio (0.125) as a percentage with at most one decimal ("12.5%"), or
 * `maximumFractionDigits` of them (0 for a whole percent).
 */
export function formatPercent(x: number, locale = "en-US", maximumFractionDigits = 1): string {
  return new Intl.NumberFormat(locale, {
    style: "percent",
    maximumFractionDigits,
  }).format(x);
}

/** "Budapest, Bologna and Berlin": a list joined the locale's way. */
export function formatList(items: string[], locale: string): string {
  return new Intl.ListFormat(locale, { style: "long", type: "conjunction" }).format(items);
}
