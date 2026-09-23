"use client";

import { ArrowLeft, Download } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { ReactNode } from "react";
import { AdminHeading, AdminLoadState } from "@/components/admin/AdminStates";
import { kindTone, Pill, statusTone } from "@/components/admin/Pill";
import { Button } from "@/components/ui/Button";
import { useLanguage } from "@/context/LanguageContext";
import { useTurn } from "@/hooks/admin/useTurn";
import { useFormatters } from "@/hooks/useFormatters";
import type { TurnDetail } from "@/services/admin";

/** Hands the whole turn to the browser as `turn-<id>.json`. */
function exportTurn(turn: TurnDetail) {
  const blob = new Blob([JSON.stringify(turn, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `turn-${turn.summary.turn_id}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

/** A collapsed block of pretty JSON. */
function JsonBlock({ title, value }: { title: string; value: unknown }) {
  return (
    <details className="rounded-xl border border-border-card bg-bg-card">
      <summary className="cursor-pointer rounded-xl px-4 py-3 text-sm font-medium text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50">
        {title}
      </summary>
      <pre className="max-h-[60dvh] overflow-auto border-t border-border-card px-4 py-3 font-mono text-xs leading-relaxed text-text-primary">
        {JSON.stringify(value, null, 2)}
      </pre>
    </details>
  );
}

/**
 * `/admin/turn/?id=` — the turn as data: its summary, then the context, the
 * steps and the SSE timeline as JSON, and the whole of it to download.
 * TRA-228 replaces this body with the inspector; `useTurn` stays.
 */
export default function TurnClientPage() {
  const { t } = useLanguage();
  const tt = t.admin.turn;
  const f = useFormatters();
  const id = useSearchParams().get("id");
  const state = useTurn(id);
  const none = t.admin.common.none;

  const back = (
    <Link
      href="/admin/turns/"
      className="inline-flex items-center gap-1.5 rounded text-sm text-text-secondary hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
    >
      <ArrowLeft size={14} aria-hidden="true" />
      {tt.back}
    </Link>
  );

  if (state.status === "not-found") {
    return (
      <div>
        {back}
        <AdminHeading title={tt.title} />
        <p className="text-text-secondary">{tt.notFound}</p>
      </div>
    );
  }

  if (state.status !== "ready") {
    return (
      <div>
        {back}
        <AdminLoadState status={state.status} error={state.status === "error" ? state.error : null} />
      </div>
    );
  }

  const { turn } = state;
  const s = turn.summary;
  const rows: [string, ReactNode][] = [
    [tt.id, <span key="id" className="font-mono text-xs break-all">{s.turn_id}</span>],
    [tt.ts, `${f.formatDate(s.ts, { year: "numeric", month: "short", day: "numeric" })} ${f.formatTime(s.ts)}`],
    [tt.kind, <Pill key="kind" tone={kindTone(s.kind)}>{t.admin.turns.kinds[s.kind]}</Pill>],
    [tt.status, <Pill key="status" tone={statusTone(s.status)}>{t.admin.turns.statuses[s.status]}</Pill>],
    [tt.city, s.city ?? none],
    [tt.model, s.model ? <span key="model" className="font-mono text-xs">{s.model}</span> : none],
    [tt.tokens, `${f.formatNumber(s.input_tokens)} / ${f.formatNumber(s.output_tokens)}`],
    [tt.latency, f.formatMs(s.latency_ms)],
    [tt.cost, s.cost_usd ? f.formatUsd(s.cost_usd) : none],
  ];

  return (
    <div>
      {back}
      <div className="mt-3">
        <AdminHeading title={tt.title} subtitle={s.question_preview}>
          <Button variant="secondary" size="sm" onClick={() => exportTurn(turn)}>
            <Download size={14} aria-hidden="true" className="mr-1.5" />
            {tt.export}
          </Button>
        </AdminHeading>
      </div>

      <section aria-labelledby="turn-summary" className="mb-6">
        <h2 id="turn-summary" className="mb-3 text-lg text-text-primary">
          {tt.summary}
        </h2>
        <dl className="grid gap-x-6 gap-y-2 rounded-xl border border-border-card bg-bg-card p-4 text-sm sm:grid-cols-[max-content_1fr]">
          {rows.map(([label, value]) => (
            <div key={label} className="contents">
              <dt className="text-text-secondary">{label}</dt>
              <dd className="tabular-nums text-text-primary">{value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <div className="flex flex-col gap-3">
        <JsonBlock title={tt.context} value={turn.context} />
        <JsonBlock title={tt.spans} value={turn.spans} />
        <JsonBlock title={tt.timeline} value={turn.timeline} />
      </div>
    </div>
  );
}
