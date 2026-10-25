"use client";

/** The LLM judge page: starts a run, follows it live and lists the stored runs. */

import Link from "next/link";
import { AdminHeading, AdminLoadState } from "@/components/admin/AdminStates";
import { EvalLauncher } from "@/components/admin/judge/EvalLauncher";
import { LiveRun } from "@/components/admin/judge/LiveRun";
import { RunReport } from "@/components/admin/judge/RunReport";
import { runHref, RunsTable } from "@/components/admin/judge/RunsTable";
import { useLanguage } from "@/context/LanguageContext";
import { useAnswerEval, useAnswerEvalRuns, type AnswerEvalError } from "@/hooks/admin/useAnswerEval";
import { useFormatters } from "@/hooks/useFormatters";
import { interpolate } from "@/i18n";
import type { EvalRun, EvalSet } from "@/services/admin";

const SETS: EvalSet[] = ["questions", "golden"];

export default function JudgeClientPage() {
  const { t } = useLanguage();
  const tj = t.admin.judge;
  const f = useFormatters();
  const { state: history, reload } = useAnswerEvalRuns();
  const evaluation = useAnswerEval(reload, tj.leaveConfirm);
  const { running, startedAt, done, total, items, finished, error } = evaluation;

  /** The headline of the latest finished run of `set`, for its launcher. */
  const lastOf = (set: EvalSet): string | null => {
    if (history.status !== "ready") return null;
    const run: EvalRun | undefined = history.runs.find((r) => r.set === set && r.status === "done");
    if (!run) return null;
    const result = run.answers
      ? interpolate(tj.history.answersScore, {
          g: f.formatNumber(run.answers.overall.groundedness),
          r: f.formatNumber(run.answers.overall.relevance),
        })
      : run.agreement?.groundedness.kappa != null
        ? interpolate(tj.history.goldenScore, { kappa: f.formatNumber(run.agreement.groundedness.kappa) })
        : tj.statuses.done;
    return interpolate(tj.launch.lastRun, { result });
  };

  return (
    <div className="flex flex-col gap-8">
      <AdminHeading title={tj.title} subtitle={tj.subtitle} />

      <div className="flex flex-col gap-3">
        <div className="grid gap-4 lg:grid-cols-2">
          {SETS.map((set) => (
            <EvalLauncher
              key={set}
              set={set}
              running={running}
              last={lastOf(set)}
              onRun={(chosen) => void evaluation.run(chosen)}
            />
          ))}
        </div>
        <details className="rounded-xl border border-border-soft px-4 py-3 text-sm">
          <summary className="cursor-pointer rounded text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50">
            {tj.rubric.title}
          </summary>
          <ul className="mt-3 flex max-w-3xl flex-col gap-2 text-text-secondary">
            <li>{tj.rubric.groundedness}</li>
            <li>{tj.rubric.relevance}</li>
            <li>{tj.rubric.gap}</li>
          </ul>
        </details>
      </div>

      <p role="status" className="sr-only">
        {finished && !running ? interpolate(tj.done, { status: tj.statuses[finished.status] }) : ""}
      </p>

      {error && <RunError error={error} />}

      {running && <LiveRun set={running} done={done} total={total} items={items} startedAt={startedAt} />}

      {finished && !running && (
        <section className="flex flex-col gap-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-heading text-lg text-text-primary">{tj.launch[finished.set].name}</h2>
            <Link
              href={runHref(finished)}
              className="rounded text-sm text-accent hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
            >
              {tj.openRun}
            </Link>
          </div>
          <RunReport run={finished} items={items} />
        </section>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="font-heading text-lg text-text-primary">{tj.history.title}</h2>
        {history.status === "ready" ? (
          <RunsTable runs={history.runs} />
        ) : (
          <AdminLoadState
            status={history.status}
            error={history.status === "error" ? history.error : undefined}
            onRetry={reload}
          />
        )}
      </section>
    </div>
  );
}

function RunError({ error }: { error: AnswerEvalError }) {
  const { t } = useLanguage();
  const tj = t.admin.judge;
  let message: string;
  if (error.kind === "busy") message = tj.busy;
  else if (error.kind === "cut") message = tj.cut;
  else if (error.kind === "stopped") message = interpolate(tj.stopped, { message: error.message });
  else return <AdminLoadState status="error" error={error.kind} />;
  return (
    <p role="alert" className="rounded-xl border border-border-card bg-bg-card p-4 text-sm text-error">
      {message}
    </p>
  );
}
