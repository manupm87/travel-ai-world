"use client";

/** One run of the LLM judge: its report and every item it graded. */

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { AdminHeading, AdminLoadState } from "@/components/admin/AdminStates";
import { EvalItemView, hasProblem } from "@/components/admin/judge/EvalItemView";
import { RunReport } from "@/components/admin/judge/RunReport";
import { RUN_TONE } from "@/components/admin/judge/RunsTable";
import { Pill } from "@/components/admin/Pill";
import { useLanguage } from "@/context/LanguageContext";
import { useAnswerEvalRun } from "@/hooks/admin/useAnswerEvalRun";
import { useFormatters } from "@/hooks/useFormatters";
import { interpolate } from "@/i18n";

export default function RunClientPage() {
  const { t } = useLanguage();
  const tj = t.admin.judge;
  const f = useFormatters();
  const id = useSearchParams().get("id");
  const state = useAnswerEvalRun(id);
  const [onlyProblems, setOnlyProblems] = useState(false);

  const back = (
    <Link
      href="/admin/judge/"
      className="inline-flex items-center gap-1.5 rounded text-sm text-text-secondary hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
    >
      <ArrowLeft size={14} aria-hidden="true" />
      {tj.back}
    </Link>
  );

  if (state.status === "not-found") {
    return (
      <div>
        {back}
        <AdminHeading title={tj.title} />
        <p className="text-text-secondary">{tj.notFound}</p>
      </div>
    );
  }
  if (state.status !== "ready") {
    return (
      <div>
        {back}
        <AdminLoadState status={state.status} error={state.status === "error" ? state.error : undefined} />
      </div>
    );
  }

  const { run, items } = state.detail;
  const shown = onlyProblems ? items.filter(hasProblem) : items;

  return (
    <div className="flex flex-col gap-6">
      <div>
        {back}
        <AdminHeading
          title={interpolate(tj.runTitle, { time: f.formatWeekdayTime(run.started_at) })}
          subtitle={tj.launch[run.set].name}
        >
          <Pill tone={RUN_TONE[run.status]}>
            {tj.statuses[run.status]}
          </Pill>
        </AdminHeading>
      </div>
      <RunReport run={run} items={items} />
      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-heading text-lg text-text-primary">
            {interpolate(tj.items, { count: shown.length })}
          </h2>
          <label className="inline-flex items-center gap-2 text-sm text-text-secondary">
            <input
              type="checkbox"
              checked={onlyProblems}
              onChange={(e) => setOnlyProblems(e.target.checked)}
              className="accent-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
            />
            {tj.onlyProblems}
          </label>
        </div>
        <ul className="flex flex-col divide-y divide-border-soft rounded-xl border border-border-card bg-bg-card">
          {shown.map((item) => (
            <li key={item.key} className="p-4">
              <EvalItemView item={item} />
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
