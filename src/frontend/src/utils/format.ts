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

/** A ratio (0.125) as a percentage with at most one decimal ("12.5%"). */
export function formatPercent(x: number, locale = "en-US"): string {
  return new Intl.NumberFormat(locale, {
    style: "percent",
    maximumFractionDigits: 1,
  }).format(x);
}
