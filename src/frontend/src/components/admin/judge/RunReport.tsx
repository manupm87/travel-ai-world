"use client";

/** A finished run of the LLM judge: its figures, its tables and the answers worth reading. */

import { Fragment, type ReactNode } from "react";
import { DataTable } from "@/components/admin/DataTable";
import { useLanguage } from "@/context/LanguageContext";
import { useFormatters } from "@/hooks/useFormatters";
import { interpolate } from "@/i18n";
import type {
  AgreementReport,
  AnswerReport,
  EvalItem,
  EvalMeans,
  EvalRun,
  ScoreAgreement,
} from "@/services/admin";
import { EvalItemView } from "./EvalItemView";

interface Kpi {
  id: string;
  label: string;
  value: string;
}

function KpiGrid({ kpis, label }: { kpis: Kpi[]; label: string }) {
  return (
    <ul aria-label={label} className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
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
  );
}

/** The items named by `keys`, in that order, when the page has them. */
function ItemList({ title, keys, items }: { title: string; keys: string[]; items?: EvalItem[] }) {
  const { t } = useLanguage();
  const byKey = new Map((items ?? []).map((item) => [item.key, item]));
  return (
    <details className="rounded-xl border border-border-card bg-bg-card p-4">
      <summary className="cursor-pointer rounded text-sm text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50">
        {title} ({keys.length})
      </summary>
      {keys.length === 0 ? (
        <p className="mt-3 text-sm text-text-secondary">{t.admin.judge.none}</p>
      ) : (
        <ul className="mt-3 flex flex-col gap-4">
          {keys.map((key) => {
            const item = byKey.get(key);
            return (
              <li key={key}>
                {item ? (
                  <EvalItemView item={item} />
                ) : (
                  <span className="font-mono text-xs text-text-secondary">{key}</span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </details>
  );
}

type MeansRow = EvalMeans & { key: string; name: string };

function AnswersReport({ report, items }: { report: AnswerReport; items?: EvalItem[] }) {
  const { t } = useLanguage();
  const tj = t.admin.judge;
  const f = useFormatters();
  const rows: MeansRow[] = [
    { ...report.overall, key: "all", name: tj.all },
    ...report.by_city.map((m) => ({ ...m, key: `city:${m.label}`, name: m.label })),
    ...report.by_language.map((m) => ({
      ...m,
      key: `lang:${m.label}`,
      name: m.label in tj.languages ? tj.languages[m.label as keyof typeof tj.languages] : m.label,
    })),
  ];
  const usd =
    report.answering.usd !== null || report.judging.usd !== null
      ? f.formatUsd((report.answering.usd ?? 0) + (report.judging.usd ?? 0))
      : t.admin.common.none;
  const kpis: Kpi[] = [
    { id: "groundedness", label: tj.kpis.groundedness, value: f.formatNumber(report.overall.groundedness) },
    { id: "relevance", label: tj.kpis.relevance, value: f.formatNumber(report.overall.relevance) },
    { id: "low", label: tj.kpis.low, value: f.formatPercent(report.overall.low_share) },
    {
      id: "unanswerable",
      label: tj.kpis.unanswerable,
      value: interpolate(tj.unanswerableValue, {
        acknowledged: report.unanswerable_acknowledged,
        total: report.unanswerable,
      }),
    },
    { id: "answers", label: tj.columns.answers, value: f.formatNumber(report.overall.answers) },
    { id: "cost", label: tj.kpis.cost, value: usd },
  ];

  return (
    <div className="flex flex-col gap-6">
      <KpiGrid kpis={kpis} label={tj.kpis.label} />
      <DataTable<MeansRow>
        caption={tj.caption}
        empty={t.admin.common.empty}
        rows={rows}
        rowKey={(row) => row.key}
        columns={[
          { key: "set", header: tj.columns.set, cell: (row) => row.name },
          { key: "answers", header: tj.columns.answers, numeric: true, cell: (row) => f.formatNumber(row.answers) },
          {
            key: "groundedness",
            header: tj.columns.groundedness,
            numeric: true,
            cell: (row) => f.formatNumber(row.groundedness),
          },
          {
            key: "relevance",
            header: tj.columns.relevance,
            numeric: true,
            cell: (row) => f.formatNumber(row.relevance),
          },
          { key: "low", header: tj.columns.low, numeric: true, cell: (row) => f.formatPercent(row.low_share) },
        ]}
      />
      <ItemList title={tj.worst} keys={report.worst} items={items} />
      <ItemList title={tj.turnedDown} keys={report.turned_down} items={items} />
    </div>
  );
}

/** A 5×5 table: the expected score in rows, the judge's in columns. */
function ConfusionMatrix({ score }: { score: ScoreAgreement }) {
  const { t } = useLanguage();
  const f = useFormatters();
  const ta = t.admin.judge.agreement;
  const name = score.score in ta.scores ? ta.scores[score.score as keyof typeof ta.scores] : score.score;
  return (
    <div className="overflow-x-auto">
      <table className="text-xs tabular-nums">
        <caption className="mb-2 text-left text-sm text-text-primary">
          {interpolate(ta.matrix, { score: name })}
        </caption>
        <thead>
          <tr>
            <td />
            {score.confusion.map((_, j) => (
              <th key={j} scope="col" className="px-2 py-1 font-medium text-text-secondary">
                {interpolate(ta.judgeScore, { n: j + 1 })}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {score.confusion.map((row, i) => (
            <tr key={i}>
              <th scope="row" className="px-2 py-1 text-left font-medium text-text-secondary">
                {interpolate(ta.expectedScore, { n: i + 1 })}
              </th>
              {row.map((count, j) => (
                <td
                  key={j}
                  className={
                    i === j
                      ? "border border-border-soft bg-bg-surface px-3 py-1 text-right font-medium text-text-primary"
                      : "border border-border-soft px-3 py-1 text-right text-text-secondary"
                  }
                >
                  {f.formatNumber(count)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AgreementView({ report, items }: { report: AgreementReport; items?: EvalItem[] }) {
  const { t } = useLanguage();
  const tj = t.admin.judge;
  const ta = tj.agreement;
  const f = useFormatters();
  const kappa = (k: number | null) => (k === null ? ta.undefined : f.formatNumber(k));
  const scores = [report.groundedness, report.relevance];
  const kpis: Kpi[] = [
    { id: "kappa-groundedness", label: tj.kpis.kappaGroundedness, value: kappa(report.groundedness.kappa) },
    { id: "kappa-relevance", label: tj.kpis.kappaRelevance, value: kappa(report.relevance.kappa) },
    { id: "low-kappa", label: tj.kpis.lowKappa, value: kappa(report.low_kappa) },
    { id: "gap", label: tj.kpis.gap, value: f.formatPercent(report.gap_accuracy) },
    { id: "cases", label: tj.kpis.cases, value: f.formatNumber(report.cases) },
    {
      id: "cost",
      label: tj.kpis.cost,
      value: report.judging.usd === null ? t.admin.common.none : f.formatUsd(report.judging.usd),
    },
  ];
  const share = (x: number | null) => (x === null ? t.admin.common.none : f.formatPercent(x));

  return (
    <div className="flex flex-col gap-6">
      <KpiGrid kpis={kpis} label={tj.kpis.label} />
      <p className="max-w-3xl text-sm text-text-secondary">{ta.kappaNote}</p>
      <DataTable<ScoreAgreement>
        caption={ta.caption}
        empty={t.admin.common.empty}
        rows={scores}
        rowKey={(row) => row.score}
        columns={[
          {
            key: "score",
            header: ta.columns.score,
            cell: (row) => (row.score in ta.scores ? ta.scores[row.score as keyof typeof ta.scores] : row.score),
          },
          { key: "exact", header: ta.columns.exact, numeric: true, cell: (row) => f.formatPercent(row.exact) },
          {
            key: "within",
            header: ta.columns.withinOne,
            numeric: true,
            cell: (row) => f.formatPercent(row.within_one),
          },
          { key: "kappa", header: ta.columns.kappa, numeric: true, cell: (row) => kappa(row.kappa) },
          {
            key: "expected",
            header: ta.columns.meanExpected,
            numeric: true,
            cell: (row) => f.formatNumber(row.mean_expected),
          },
          { key: "judge", header: ta.columns.meanJudge, numeric: true, cell: (row) => f.formatNumber(row.mean_judge) },
        ]}
      />
      <p className="text-sm text-text-secondary">
        {interpolate(ta.origin, { real: share(report.exact_real), perturbed: share(report.exact_perturbed) })}
      </p>
      <div className="grid gap-6 lg:grid-cols-2">
        {scores.map((score) => (
          <ConfusionMatrix key={score.score} score={score} />
        ))}
      </div>
      <ItemList title={tj.disagreements} keys={report.disagreements} items={items} />
    </div>
  );
}

/** `interpolate` for a template whose values may be elements; unknown keys stay as written. */
function withNodes(template: string, values: Record<string, ReactNode>): ReactNode[] {
  return template.split(/\{(\w+)\}/).map((part, n) =>
    n % 2 === 1 && part in values ? <Fragment key={n}>{values[part]}</Fragment> : part
  );
}

/**
 * A finished run. `items`, when the page has them (the live run or the run detail), lets the
 * worst answers and the disagreements open in place.
 */
export function RunReport({ run, items }: { run: EvalRun; items?: EvalItem[] }) {
  const { t } = useLanguage();
  const tj = t.admin.judge;
  const f = useFormatters();
  const mono = (text: string) => <span className="font-mono">{text}</span>;
  const meta = withNodes(run.set === "questions" ? tj.metaAnswers : tj.metaGolden, {
    answer: mono(run.answer_model ?? ""),
    judge: mono(run.judge_model),
    prompt: mono(run.judge_prompt),
    time: f.formatWeekdayTime(run.started_at),
  });

  return (
    <section className="flex flex-col gap-4" aria-label={tj.sets[run.set]}>
      <p className="break-words text-xs text-text-secondary">{meta}</p>
      {run.error && (
        <p role="alert" className="text-sm text-error">
          {interpolate(tj.stopped, { message: run.error })}
        </p>
      )}
      {run.answers && <AnswersReport report={run.answers} items={items} />}
      {run.agreement && <AgreementView report={run.agreement} items={items} />}
    </section>
  );
}
