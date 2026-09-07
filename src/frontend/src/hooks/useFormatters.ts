"use client";

import { useMemo } from "react";
import { useLanguage } from "@/context/LanguageContext";
import { formatCurrency, formatDate, formatDuration } from "@/utils/format";

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
    }),
    [locale]
  );
}

export type Formatters = ReturnType<typeof useFormatters>;
