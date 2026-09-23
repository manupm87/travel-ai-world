import type { Formatters } from "@/hooks/useFormatters";
import { interpolate } from "@/i18n";
import type { Translations } from "@/i18n/types";
import type { TraceStats } from "@/services/admin";

export type KpiId =
  | "turns"
  | "errorRate"
  | "p95"
  | "outputTokens"
  | "cost"
  | "noHit"
  | "usedRetrieved";

export interface Kpi {
  id: KpiId;
  label: string;
  value: string;
  hint: string;
}

type Fmt = Pick<Formatters, "formatNumber" | "formatMs" | "formatUsd" | "formatPercent">;

/**
 * The overview's seven tiles from a range's stats. Pure, so the arithmetic
 * (the error rate counts cancelled turns too; a cost of 0 means nothing was
 * priced, not free) is tested without rendering. An empty range reads as
 * zeros and dashes, never `NaN`.
 */
export function toKpis(
  stats: TraceStats,
  f: Fmt,
  t: Translations["admin"]["overview"]["kpis"],
  none: string
): Kpi[] {
  const { totals, rag } = stats;
  const ms = (value: number | null) => (value === null ? none : f.formatMs(value));
  const pct = (value: number | null) => (value === null ? none : f.formatPercent(value));
  const errorRate = totals.turns > 0 ? (totals.errors + totals.cancelled) / totals.turns : 0;
  const perTurn =
    rag.retrievals_per_turn === null
      ? none
      : f.formatNumber(Math.round(rag.retrievals_per_turn * 10) / 10);

  return [
    {
      id: "turns",
      label: t.turns,
      value: f.formatNumber(totals.turns),
      hint: interpolate(t.turnsHint, {
        sessions: f.formatNumber(totals.sessions),
        users: f.formatNumber(totals.subjects),
      }),
    },
    {
      id: "errorRate",
      label: t.errorRate,
      value: f.formatPercent(errorRate),
      hint: interpolate(t.errorRateHint, {
        errors: f.formatNumber(totals.errors),
        cancelled: f.formatNumber(totals.cancelled),
      }),
    },
    {
      id: "p95",
      label: t.p95,
      value: ms(totals.latency_p95_ms),
      hint: interpolate(t.p95Hint, { p50: ms(totals.latency_p50_ms) }),
    },
    {
      id: "outputTokens",
      label: t.outputTokens,
      value: f.formatNumber(totals.output_tokens),
      hint: interpolate(t.outputTokensHint, { input: f.formatNumber(totals.input_tokens) }),
    },
    {
      id: "cost",
      label: t.cost,
      value: totals.cost_usd > 0 ? f.formatUsd(totals.cost_usd) : none,
      hint: t.costHint,
    },
    { id: "noHit", label: t.noHit, value: pct(rag.no_hit_rate), hint: t.noHitHint },
    {
      id: "usedRetrieved",
      label: t.usedRetrieved,
      value: pct(rag.used_over_retrieved),
      hint: interpolate(t.usedRetrievedHint, { perTurn }),
    },
  ];
}
