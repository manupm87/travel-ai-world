"use client";

/** One evaluation the judge page can start: what it measures, what a run takes, its last result. */

import { Button } from "@/components/ui/Button";
import { useLanguage } from "@/context/LanguageContext";
import type { EvalSet } from "@/services/admin";
import { EVAL_TECH } from "./RunsTable";

interface EvalLauncherProps {
  set: EvalSet;
  /** The set being run, if any: every launcher waits while one runs. */
  running: EvalSet | null;
  /** The last stored run's headline, or `null` when there is none. */
  last: string | null;
  onRun: (set: EvalSet) => void;
}

export function EvalLauncher({ set, running, last, onRun }: EvalLauncherProps) {
  const { t } = useLanguage();
  const tj = t.admin.judge;
  const copy = tj.launch[set];
  const facts = [
    { id: "models", label: tj.launch.facts.models, value: copy.models },
    { id: "size", label: tj.launch.facts.size, value: copy.size },
    { id: "duration", label: tj.launch.facts.duration, value: copy.duration },
    { id: "cost", label: tj.launch.facts.cost, value: copy.cost },
  ];
  const busy = running !== null;

  return (
    <article
      data-eval={set}
      aria-labelledby={`eval-${set}`}
      className="flex flex-col gap-4 rounded-xl border border-border-card bg-bg-card p-5"
    >
      <div>
        <h2 id={`eval-${set}`} className="font-heading text-lg text-text-primary">
          {copy.name}
        </h2>
        <p className="mt-1 flex flex-wrap items-baseline gap-x-2 text-xs text-text-secondary">
          <span className="font-mono text-text-primary">{EVAL_TECH[set]}</span>
          <span>{copy.method}</span>
        </p>
      </div>
      <p className="text-sm text-text-primary">{copy.measures}</p>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
        {facts.map((fact) => (
          <div key={fact.id} className="contents">
            <dt className="text-text-secondary">{fact.label}</dt>
            <dd className="text-text-primary">{fact.value}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-auto flex flex-wrap items-center justify-between gap-3 border-t border-border-soft pt-4">
        <p className="text-xs text-text-secondary">{last ?? tj.launch.neverRun}</p>
        <Button
          type="button"
          size="sm"
          variant={set === "questions" ? "primary" : "secondary"}
          onClick={() => {
            // `aria-disabled`, not `disabled`: the button keeps the focus while it waits
            if (!busy) onRun(set);
          }}
          aria-disabled={busy}
          className={busy ? "cursor-not-allowed opacity-60" : undefined}
        >
          {running === set ? tj.running : set === "questions" ? tj.runQuestions : tj.runGolden}
        </Button>
      </div>
    </article>
  );
}
