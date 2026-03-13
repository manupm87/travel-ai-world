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
