"use client";

import { useLanguage } from "@/context/LanguageContext";
import { cn } from "@/utils/cn";

export const RANGES = [7, 30] as const;
export type RangeDays = (typeof RANGES)[number];

/** `?range=30` is the only other value; anything else is the default week. */
export function parseRange(value: string | null): RangeDays {
  return value === "30" ? 30 : 7;
}

/** A two-way segmented control: the last 7 or the last 30 days. */
export function RangePicker({
  value,
  onChange,
}: {
  value: RangeDays;
  onChange: (days: RangeDays) => void;
}) {
  const { t } = useLanguage();
  const labels: Record<RangeDays, string> = {
    7: t.admin.overview.last7,
    30: t.admin.overview.last30,
  };

  return (
    <div
      role="group"
      aria-label={t.admin.overview.range}
      className="inline-flex rounded-lg border border-border-card bg-bg-card p-0.5"
    >
      {RANGES.map((days) => (
        <button
          key={days}
          type="button"
          aria-pressed={value === days}
          onClick={() => onChange(days)}
          className={cn(
            "rounded-md px-3 py-1.5 text-sm tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50",
            value === days
              ? "bg-accent-soft font-medium text-text-primary"
              : "text-text-secondary hover:text-text-primary"
          )}
        >
          {labels[days]}
        </button>
      ))}
    </div>
  );
}
