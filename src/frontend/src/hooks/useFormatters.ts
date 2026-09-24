"use client";

import { useMemo } from "react";
import { useLanguage } from "@/context/LanguageContext";
import {
  formatCurrency,
  formatDate,
  formatDuration,
  formatList,
  formatMs,
  formatNumber,
  formatPercent,
  formatTime,
  formatUsd,
} from "@/utils/format";

/**
 * The formatters from `utils/format`, bound to the active language's locale.
 * Components use these instead of mapping `language` to a BCP 47 tag by hand.
 */
export function useFormatters() {
  const { locale } = useLanguage();

  return useMemo(
    () => ({
      formatDate: (dateStr: string, options?: Intl.DateTimeFormatOptions) =>
        formatDate(dateStr, locale, options),
      formatCurrency: (amount: number, currency: string) =>
        formatCurrency(amount, currency, locale),
      formatDuration,
      /** A count with the locale's grouping. */
      formatNumber: (n: number) => formatNumber(n, locale),
      /** A latency: "640 ms" under a second, "1.2 s" above. */
      formatMs: (ms: number) => formatMs(ms, locale),
      /** US dollars, two decimals (four under a cent). */
      formatUsd: (n: number) => formatUsd(n, locale),
      /** A 0–1 ratio as a percentage, at most one decimal. */
      formatPercent: (x: number) => formatPercent(x, locale),
      /** "Budapest, Bologna and Berlin", joined the locale's way. */
      formatList: (items: string[]) => formatList(items, locale),
      /** The local time of a timestamp, `HH:mm:ss`. */
      formatTime: (iso: string) => formatTime(iso, locale),
    }),
    [locale]
  );
}

export type Formatters = ReturnType<typeof useFormatters>;
