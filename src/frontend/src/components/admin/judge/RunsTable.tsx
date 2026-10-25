"use client";

/** The LLM judge's stored runs, newest first; a row opens the run. */

import { DataTable } from "@/components/admin/DataTable";
import { Pill, type PillTone } from "@/components/admin/Pill";
import { useLanguage } from "@/context/LanguageContext";
import { useFormatters } from "@/hooks/useFormatters";
import { interpolate } from "@/i18n";
import type { EvalRun } from "@/services/admin";

/** The evaluations by the names the code, the CLI and the report use. */
export const EVAL_TECH: Record<EvalRun["set"], string> = {
  questions: "answer_eval",
  golden: "judge_validation",
};

export const RUN_TONE: Record<EvalRun["status"], PillTone> = {
  running: "accent",
  done: "success",
  failed: "error",
  interrupted: "muted",
};

export function runHref(run: Pick<EvalRun, "run_id">): string {
  return `/admin/judge/run/?id=${encodeURIComponent(run.run_id)}`;
}

export function RunsTable({ runs }: { runs: EvalRun[] }) {
  const { t } = useLanguage();
  const tj = t.admin.judge;
  const th = tj.history;
  const f = useFormatters();

  const result = (run: EvalRun): string => {
    if (run.answers) {
      return interpolate(th.answersScore, {
        g: f.formatNumber(run.answers.overall.groundedness),
        r: f.formatNumber(run.answers.overall.relevance),
      });
    }
    if (run.agreement) {
      const kappa = run.agreement.groundedness.kappa;
      return interpolate(th.goldenScore, {
        kappa: kappa === null ? tj.agreement.undefined : f.formatNumber(kappa),
      });
    }
    return t.admin.common.none;
  };

  return (
    <DataTable<EvalRun>
      caption={th.caption}
      empty={th.empty}
      rows={runs}
      rowKey={(run) => run.run_id}
      href={runHref}
      columns={[
        { key: "started", header: th.columns.started, cell: (run) => f.formatWeekdayTime(run.started_at) },
        {
          key: "set",
          header: th.columns.set,
          cell: (run) => (
            <span className="flex flex-col">
              <span>{tj.launch[run.set].name}</span>
              <span className="font-mono text-xs text-text-secondary">{EVAL_TECH[run.set]}</span>
            </span>
          ),
        },
        {
          key: "status",
          header: th.columns.status,
          cell: (run) => <Pill tone={RUN_TONE[run.status]}>{tj.statuses[run.status]}</Pill>,
        },
        {
          key: "judge",
          header: th.columns.judge,
          className: "hidden font-mono text-xs md:table-cell",
          headerClassName: "hidden md:table-cell",
          cell: (run) => run.judge_model,
        },
        { key: "score", header: th.columns.score, cell: result },
        {
          key: "cost",
          header: th.columns.cost,
          numeric: true,
          cell: (run) => (run.usd === null ? t.admin.common.none : f.formatUsd(run.usd)),
        },
      ]}
    />
  );
}
