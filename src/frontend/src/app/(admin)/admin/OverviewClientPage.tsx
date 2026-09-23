"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, type ReactNode } from "react";
import { AdminHeading, AdminLoadState } from "@/components/admin/AdminStates";
import { DataTable } from "@/components/admin/DataTable";
import { DailyChart } from "@/components/admin/overview/DailyChart";
import { KpiTiles } from "@/components/admin/overview/KpiTiles";
import { parseRange, RangePicker, type RangeDays } from "@/components/admin/overview/RangePicker";
import { useLanguage } from "@/context/LanguageContext";
import { rangeFor, useAdminStats } from "@/hooks/admin/useAdminStats";
import { useFormatters } from "@/hooks/useFormatters";
import { interpolate } from "@/i18n";
import type { TraceStats } from "@/services/admin";

type Row<K extends keyof TraceStats> = TraceStats[K] extends (infer R)[] ? R : never;

/** A titled block of the overview. */
function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="min-w-0">
      <h2 className="mb-3 text-lg text-text-primary">{title}</h2>
      {children}
    </section>
  );
}

/**
 * The overview: the range, seven figures, the day-by-day chart and the
 * breakdowns (model, city, kind, the documents used most and those retrieved
 * but never used).
 */
export default function OverviewClientPage() {
  const { t } = useLanguage();
  const to = t.admin.overview;
  const tt = to.tables;
  const f = useFormatters();
  const router = useRouter();
  const params = useSearchParams();
  const range = parseRange(params.get("range"));
  const { start, end } = useMemo(() => rangeFor(range), [range]);
  const stats = useAdminStats(start, end);

  const setRange = (days: RangeDays) => {
    router.replace(days === 7 ? "/admin/" : `/admin/?range=${days}`, { scroll: false });
  };

  const day = (d: string) =>
    f.formatDate(`${d}T12:00:00Z`, { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
  const usd = (n: number) => (n > 0 ? f.formatUsd(n) : t.admin.common.none);
  const mono = (value: string) => <span className="font-mono text-xs">{value}</span>;
  const none = t.admin.common.none;

  return (
    <div>
      <AdminHeading title={to.title} subtitle={interpolate(to.rangeSpan, { start: day(start), end: day(end) })}>
        <RangePicker value={range} onChange={setRange} />
      </AdminHeading>

      {stats.status !== "ready" ? (
        <AdminLoadState status={stats.status} error={stats.status === "error" ? stats.error : null} onRetry={stats.reload} />
      ) : (
        <div className="flex flex-col gap-8">
          <KpiTiles stats={stats.stats} />

          <Panel title={to.chart.title}>
            <div className="rounded-xl border border-border-card bg-bg-card p-4">
              <DailyChart start={stats.stats.start} end={stats.stats.end} days={stats.stats.days} />
            </div>
          </Panel>

          <div className="grid gap-8 xl:grid-cols-2">
            <Panel title={tt.byModel}>
              <DataTable<Row<"by_model">>
                caption={tt.byModel}
                empty={t.admin.common.empty}
                rows={stats.stats.by_model}
                rowKey={(r) => r.model}
                columns={[
                  { key: "model", header: tt.model, cell: (r) => mono(r.model) },
                  { key: "turns", header: tt.turns, numeric: true, cell: (r) => f.formatNumber(r.turns) },
                  { key: "in", header: tt.tokensIn, numeric: true, cell: (r) => f.formatNumber(r.input_tokens) },
                  { key: "out", header: tt.tokensOut, numeric: true, cell: (r) => f.formatNumber(r.output_tokens) },
                  { key: "cost", header: tt.cost, numeric: true, cell: (r) => usd(r.cost_usd) },
                ]}
              />
            </Panel>

            <Panel title={tt.byCity}>
              <DataTable<Row<"by_city">>
                caption={tt.byCity}
                empty={t.admin.common.empty}
                rows={stats.stats.by_city}
                rowKey={(r) => r.city}
                columns={[
                  { key: "city", header: tt.city, cell: (r) => r.city || none },
                  { key: "turns", header: tt.turns, numeric: true, cell: (r) => f.formatNumber(r.turns) },
                  { key: "errors", header: tt.errors, numeric: true, cell: (r) => f.formatNumber(r.errors) },
                ]}
              />
            </Panel>

            <Panel title={tt.byKind}>
              <DataTable<Row<"by_kind">>
                caption={tt.byKind}
                empty={t.admin.common.empty}
                rows={stats.stats.by_kind}
                rowKey={(r) => r.kind}
                columns={[
                  {
                    key: "kind",
                    header: tt.kind,
                    cell: (r) =>
                      r.kind in t.admin.turns.kinds
                        ? t.admin.turns.kinds[r.kind as keyof typeof t.admin.turns.kinds]
                        : r.kind,
                  },
                  { key: "turns", header: tt.turns, numeric: true, cell: (r) => f.formatNumber(r.turns) },
                  { key: "errors", header: tt.errors, numeric: true, cell: (r) => f.formatNumber(r.errors) },
                  { key: "cost", header: tt.cost, numeric: true, cell: (r) => usd(r.cost_usd) },
                ]}
              />
            </Panel>

            <Panel title={tt.topUsed}>
              <DataTable<Row<"top_used">>
                caption={tt.topUsed}
                empty={t.admin.common.empty}
                rows={stats.stats.top_used}
                rowKey={(r) => r.doc_id}
                columns={[
                  { key: "doc", header: tt.docId, cell: (r) => mono(r.doc_id) },
                  { key: "title", header: tt.title, cell: (r) => r.title ?? none },
                  { key: "count", header: tt.count, numeric: true, cell: (r) => f.formatNumber(r.count) },
                ]}
              />
            </Panel>

            <Panel title={tt.neverUsed}>
              <DataTable<Row<"never_used">>
                caption={tt.neverUsed}
                empty={t.admin.common.empty}
                rows={stats.stats.never_used}
                rowKey={(r) => r.doc_id}
                columns={[
                  { key: "doc", header: tt.docId, cell: (r) => mono(r.doc_id) },
                  { key: "title", header: tt.title, cell: (r) => r.title ?? none },
                  { key: "retrieved", header: tt.retrieved, numeric: true, cell: (r) => f.formatNumber(r.retrieved) },
                ]}
              />
            </Panel>
          </div>
        </div>
      )}
    </div>
  );
}
