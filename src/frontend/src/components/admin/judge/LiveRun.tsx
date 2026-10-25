"use client";

/** The run in progress: how far it got, the running scores and the latest graded answers. */

import { Info } from "lucide-react";
import { useEffect, useState } from "react";
import { Pill, type PillTone } from "@/components/admin/Pill";
import { useLanguage } from "@/context/LanguageContext";
import { useFormatters } from "@/hooks/useFormatters";
import { interpolate } from "@/i18n";
import type { EvalItem, EvalSet } from "@/services/admin";
import { EVAL_TECH } from "./RunsTable";

const LOW = 3;

/** Rows kept on screen; the run detail has every one. */
const SHOWN = 8;

interface LiveRunProps {
  set: EvalSet;
  done: number;
  total: number;
  /** Newest first. */
  items: EvalItem[];
  /** When the run started, in epoch milliseconds. */
  startedAt: number;
}

function mean(values: number[]): number | null {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
}

function scoreTone(score: number): PillTone {
  if (score < LOW) return "error";
  return score === 5 ? "success" : "gold";
}

function agrees(item: EvalItem): boolean {
  const v = item.verdict;
  const e = item.expected;
  return (
    !!v &&
    !!e &&
    v.groundedness === e.groundedness &&
    v.relevance === e.relevance &&
    v.acknowledges_gap === e.acknowledges_gap
  );
}

/** "1:05": minutes and seconds since `since`, ticking once a second. */
function useElapsed(since: number): string {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const seconds = Math.max(0, Math.floor((now - since) / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

export function LiveRun({ set, done, total, items, startedAt }: LiveRunProps) {
  const { t } = useLanguage();
  const tj = t.admin.judge;
  const f = useFormatters();
  const elapsed = useElapsed(startedAt);
  const graded = items.filter((item) => item.verdict);
  const share = total ? done / total : 0;

  const g = mean(graded.map((item) => item.verdict!.groundedness));
  const r = mean(graded.map((item) => item.verdict!.relevance));
  const tallies =
    set === "questions"
      ? [
          { id: "groundedness", label: tj.tallies.groundedness, value: g === null ? "–" : f.formatNumber(g) },
          { id: "relevance", label: tj.tallies.relevance, value: r === null ? "–" : f.formatNumber(r) },
          {
            id: "low",
            label: tj.tallies.low,
            value: f.formatNumber(
              graded.filter((item) => Math.min(item.verdict!.groundedness, item.verdict!.relevance) < LOW).length
            ),
          },
        ]
      : [
          {
            id: "agree",
            label: tj.tallies.agree,
            value: `${f.formatNumber(graded.filter(agrees).length)} / ${f.formatNumber(graded.length)}`,
          },
          { id: "groundedness", label: tj.tallies.groundedness, value: g === null ? "–" : f.formatNumber(g) },
          { id: "relevance", label: tj.tallies.relevance, value: r === null ? "–" : f.formatNumber(r) },
        ];

  const score = (item: EvalItem, field: "groundedness" | "relevance") => {
    const judged = item.verdict?.[field];
    if (judged === undefined) return <span className="text-error">–</span>;
    const expected = item.expected?.[field];
    if (expected === undefined) return <Pill tone={scoreTone(judged)}>{judged}</Pill>;
    return (
      <Pill tone={expected === judged ? "success" : "error"}>
        {interpolate(tj.versus, { expected, judge: judged })}
      </Pill>
    );
  };

  return (
    <section
      aria-labelledby="live-run"
      className="flex flex-col gap-6 rounded-xl border border-border-card bg-bg-card p-5 md:p-6"
    >
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 id="live-run" className="font-heading text-lg text-text-primary">
            {tj.liveTitle[set]}
          </h2>
          <p className="mt-1 font-mono text-xs text-text-secondary">{EVAL_TECH[set]}</p>
        </div>
        <div className="text-right">
          <p className="font-heading text-4xl font-light tabular-nums text-text-primary">
            {f.formatNumber(done)}
            <span className="text-2xl text-text-secondary"> / {total ? f.formatNumber(total) : "…"}</span>
          </p>
          <p className="mt-1 text-xs tabular-nums text-text-secondary">
            {interpolate(tj.elapsed, { time: elapsed })}
          </p>
        </div>
      </div>

      <div
        role="progressbar"
        aria-label={tj.progressLabel}
        aria-valuemin={0}
        aria-valuemax={total || 1}
        aria-valuenow={done}
        aria-valuetext={interpolate(tj.progress, { done: f.formatNumber(done), total: f.formatNumber(total) })}
        className="h-2.5 w-full overflow-hidden rounded-full bg-bg-surface"
      >
        <div
          className="h-full rounded-full bg-accent motion-safe:transition-[width] motion-safe:duration-500"
          style={{ width: `${Math.round(share * 100)}%` }}
        />
      </div>

      <ul className="grid gap-3 sm:grid-cols-3">
        {tallies.map((tally) => (
          <li key={tally.id} data-tally={tally.id} className="rounded-lg border border-border-soft px-4 py-3">
            <p className="text-xs text-text-secondary">{tally.label}</p>
            <p className="mt-1 font-heading text-2xl font-light tabular-nums text-text-primary">{tally.value}</p>
          </li>
        ))}
      </ul>

      <p className="flex items-start gap-2 text-sm text-text-secondary">
        <Info size={16} aria-hidden="true" className="mt-0.5 shrink-0" />
        {tj.keepOpen}
      </p>

      {items.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <caption className="mb-2 text-left text-sm font-medium text-text-primary">
              {tj.live}
              {set === "golden" && (
                <span className="ml-2 font-normal text-text-secondary">{tj.versusHint}</span>
              )}
            </caption>
            <thead>
              <tr className="border-b border-border-soft text-left text-xs text-text-secondary">
                <th scope="col" className="py-2 pr-4 font-medium">
                  {tj.liveColumns.question}
                </th>
                <th scope="col" className="px-3 py-2 font-medium">
                  {tj.liveColumns.groundedness}
                </th>
                <th scope="col" className="px-3 py-2 font-medium">
                  {tj.liveColumns.relevance}
                </th>
                <th scope="col" className="py-2 pl-3 font-medium">
                  {tj.liveColumns.gap}
                </th>
              </tr>
            </thead>
            <tbody>
              {items.slice(0, SHOWN).map((item) => (
                <tr key={item.key} data-item={item.key} className="border-b border-border-soft last:border-0">
                  <td className="max-w-md py-3 pr-4 align-top">
                    <p className="text-text-primary">{item.query}</p>
                    <p className="mt-0.5 font-mono text-xs text-text-secondary">{item.key}</p>
                  </td>
                  <td className="px-3 py-3 align-top">{score(item, "groundedness")}</td>
                  <td className="px-3 py-3 align-top">{score(item, "relevance")}</td>
                  <td className="py-3 pl-3 align-top text-text-secondary">
                    {item.verdict ? (item.verdict.acknowledges_gap ? tj.yes : tj.no) : "–"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
