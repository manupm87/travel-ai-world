"use client";

import { AdminHeading, AdminLoadState } from "@/components/admin/AdminStates";
import { DataTable } from "@/components/admin/DataTable";
import { Button } from "@/components/ui/Button";
import { useLanguage } from "@/context/LanguageContext";
import { useRetrievalEval } from "@/hooks/admin/useRetrievalEval";
import { useFormatters } from "@/hooks/useFormatters";
import { interpolate } from "@/i18n";
import type { RetrievalEval, RetrievalScores } from "@/services/admin";

type Row = RetrievalScores & { key: string; name: string };

/**
 * The retrieval evaluation (TRA-273): one button runs the 20 questions of
 * every city against the deployed index (`POST /ai/admin/retrieval-eval`) and
 * the page shows recall@5, recall@10 and MRR overall, per city and per
 * language, then the questions that missed an expected document. Nothing runs
 * on arrival and nothing is stored: the figures are the index as it is now.
 * The last result stays on screen while the next run goes, and under the
 * error of a failed one.
 */
export default function QualityClientPage() {
  const { t } = useLanguage();
  const tq = t.admin.quality;
  const evaluation = useRetrievalEval();
  const { result, running, error } = evaluation;

  const run = () => {
    // `aria-disabled`, not `disabled`: the button keeps the focus while it waits.
    if (running) return;
    evaluation.run();
  };

  return (
    <div>
      <AdminHeading title={tq.title} subtitle={tq.subtitle}>
        <Button
          type="button"
          size="sm"
          onClick={run}
          aria-disabled={running}
          className={running ? "cursor-not-allowed opacity-60" : undefined}
        >
          {running ? tq.running : tq.run}
        </Button>
      </AdminHeading>
      <p className="mb-6 max-w-3xl text-sm text-text-secondary">{tq.explain}</p>
      <p role="status" className="sr-only">
        {result && !running && !error ? tq.done : ""}
      </p>

      {error && (
        <div className="mb-6">
          <AdminLoadState status="error" error={error} onRetry={run} />
        </div>
      )}
      {result ? (
        <EvalResult result={result} />
      ) : running ? (
        <AdminLoadState status="loading" />
      ) : (
        !error && (
          <p className="rounded-xl border border-border-card bg-bg-card p-6 text-sm text-text-secondary">
            {tq.idle}
          </p>
        )
      )}
    </div>
  );
}

/** One run: the overall figures, the table by city and language, the misses. */
function EvalResult({ result }: { result: RetrievalEval }) {
  const { t } = useLanguage();
  const tq = t.admin.quality;
  const f = useFormatters();

  const rows: Row[] = [
    { ...result.overall, key: "all", name: tq.all },
    ...result.by_city.map((s) => ({ ...s, key: `city:${s.label}`, name: s.label })),
    ...result.by_language.map((s) => ({
      ...s,
      key: `lang:${s.label}`,
      name: s.label in tq.languages ? tq.languages[s.label as keyof typeof tq.languages] : s.label,
    })),
  ];
  const kpis = [
    { id: "recall10", label: tq.kpis.recall10, value: f.formatScore(result.overall.recall_at_10) },
    { id: "mrr", label: tq.kpis.mrr, value: f.formatScore(result.overall.mrr) },
    { id: "recall5", label: tq.kpis.recall5, value: f.formatScore(result.overall.recall_at_5) },
    { id: "questions", label: tq.kpis.questions, value: f.formatNumber(result.overall.questions) },
  ];

  return (
    <div className="flex flex-col gap-8">
      <div>
        <ul aria-label={tq.kpis.label} className="grid grid-cols-2 gap-3 md:grid-cols-4">
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
            </li>
          ))}
        </ul>
        <p className="mt-3 break-words text-xs text-text-secondary">
          {interpolate(tq.meta, {
            time: f.formatWeekdayTime(result.ran_at),
            index: result.index,
            model: result.embeddings_model,
            k: result.top_k,
          })}
        </p>
      </div>

      <DataTable<Row>
        caption={tq.caption}
        empty={t.admin.common.empty}
        rows={rows}
        rowKey={(row) => row.key}
        columns={[
          { key: "set", header: tq.columns.set, cell: (row) => row.name },
          {
            key: "questions",
            header: tq.columns.questions,
            numeric: true,
            cell: (row) => f.formatNumber(row.questions),
          },
          {
            key: "recall5",
            header: tq.columns.recall5,
            numeric: true,
            cell: (row) => f.formatScore(row.recall_at_5),
          },
          {
            key: "recall10",
            header: tq.columns.recall10,
            numeric: true,
            cell: (row) => f.formatScore(row.recall_at_10),
          },
          { key: "mrr", header: tq.columns.mrr, numeric: true, cell: (row) => f.formatScore(row.mrr) },
        ]}
      />

      {result.missing_from_index.length > 0 && (
        <section className="rounded-xl border border-border-card bg-bg-card p-4">
          <h2 className="text-sm font-medium text-text-primary">{tq.missing}</h2>
          <ul className="mt-2 font-mono text-xs text-text-secondary">
            {result.missing_from_index.map((id) => (
              <li key={id} className="break-all">
                {id}
              </li>
            ))}
          </ul>
        </section>
      )}

      {result.misses.length === 0 ? (
        <p className="text-sm text-text-secondary">{tq.noMisses}</p>
      ) : (
        <details className="rounded-xl border border-border-card bg-bg-card p-4">
          <summary className="cursor-pointer text-sm text-text-primary">
            {interpolate(tq.misses, { count: result.misses.length, total: result.overall.questions })}
          </summary>
          <ul className="mt-3 flex flex-col gap-3">
            {result.misses.map((miss) => (
              <li key={`${miss.city}/${miss.id}`} className="text-sm">
                <p className="text-text-primary">
                  <span className="font-mono text-xs text-text-secondary">
                    {miss.city}/{miss.id} ({miss.lang})
                  </span>{" "}
                  “{miss.query}”
                </p>
                <ul className="mt-1 font-mono text-xs text-text-secondary">
                  {miss.expected.map((e) => (
                    <li key={e.doc_id} className="break-all">
                      {e.doc_id} ·{" "}
                      {e.rank === null
                        ? interpolate(tq.notFound, { k: result.top_k })
                        : interpolate(tq.rank, { rank: e.rank })}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
