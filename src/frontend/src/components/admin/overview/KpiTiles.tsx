"use client";

import { useLanguage } from "@/context/LanguageContext";
import { useFormatters } from "@/hooks/useFormatters";
import type { TraceStats } from "@/services/admin";
import { toKpis } from "./kpis";

/** The overview's seven figures: 2 columns on a phone, 4 from md, 7 from xl. */
export function KpiTiles({ stats }: { stats: TraceStats }) {
  const { t } = useLanguage();
  const f = useFormatters();
  const kpis = toKpis(stats, f, t.admin.overview.kpis, t.admin.common.none);

  return (
    <ul
      aria-label={t.admin.overview.kpis.label}
      className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7"
    >
      {kpis.map((kpi) => (
        <li
          key={kpi.id}
          data-kpi={kpi.id}
          className="min-w-0 rounded-xl border border-border-card bg-bg-card px-4 py-3"
        >
          <p className="truncate text-xs font-medium text-text-secondary [font-variant-caps:all-small-caps] tracking-wide">
            {kpi.label}
          </p>
          <p className="mt-1 truncate font-heading text-2xl font-light tabular-nums text-text-primary">
            {kpi.value}
          </p>
          <p className="mt-1 truncate text-xs text-text-secondary" title={kpi.hint}>
            {kpi.hint}
          </p>
        </li>
      ))}
    </ul>
  );
}
