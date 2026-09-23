"use client";

import { useLanguage } from "@/context/LanguageContext";
import { displayName } from "@/hooks/admin/useAdminUsers";
import { useFormatters } from "@/hooks/useFormatters";
import { interpolate } from "@/i18n";
import type { AdminUser, TurnSummary } from "@/services/admin";
import { DataTable } from "../DataTable";
import { Pill, statusTone } from "../Pill";

/** Where a turn row leads: the turn page (TRA-228's inspector). */
export function turnHref(turnId: string): string {
  return `/admin/turn/?id=${encodeURIComponent(turnId)}`;
}

/** One row per turn; the time links to the turn. */
export function TurnsTable({
  turns,
  bySubject,
}: {
  turns: TurnSummary[];
  bySubject: Map<string, AdminUser>;
}) {
  const { t } = useLanguage();
  const tc = t.admin.turns.columns;
  const f = useFormatters();
  const none = t.admin.common.none;

  return (
    <DataTable<TurnSummary>
      caption={t.admin.turns.caption}
      empty={t.admin.turns.empty}
      rows={turns}
      rowKey={(turn) => turn.turn_id}
      href={(turn) => turnHref(turn.turn_id)}
      columns={[
        { key: "time", header: tc.time, numeric: true, cell: (turn) => f.formatTime(turn.ts) },
        {
          key: "user",
          header: tc.user,
          className: "whitespace-nowrap",
          cell: (turn) =>
            displayName(bySubject.get(turn.subject)) ?? (
              <span className="font-mono text-xs">{turn.subject.slice(0, 8)}</span>
            ),
        },
        { key: "city", header: tc.city, className: "whitespace-nowrap", cell: (turn) => turn.city ?? none },
        {
          key: "action",
          header: tc.action,
          className: "whitespace-nowrap",
          cell: (turn) => (
            <span className="font-mono text-xs">{turn.action ?? t.admin.turns.kinds[turn.kind]}</span>
          ),
        },
        { key: "calls", header: tc.llmCalls, numeric: true, cell: (turn) => f.formatNumber(turn.llm_calls) },
        {
          key: "searches",
          header: tc.searches,
          numeric: true,
          cell: (turn) => (
            <span>
              {f.formatNumber(turn.retrievals)}
              <span className="ml-1.5 text-xs text-text-secondary">
                {interpolate(t.admin.turns.searchesHint, {
                  used: f.formatNumber(turn.docs_used),
                  retrieved: f.formatNumber(turn.docs_retrieved),
                })}
              </span>
            </span>
          ),
        },
        {
          key: "tokens",
          header: tc.tokens,
          numeric: true,
          cell: (turn) => `${f.formatNumber(turn.input_tokens)} / ${f.formatNumber(turn.output_tokens)}`,
        },
        { key: "latency", header: tc.latency, numeric: true, cell: (turn) => `${f.formatNumber(Math.round(turn.latency_ms / 100) / 10)} s`,
        },
        {
          key: "status",
          header: tc.status,
          cell: (turn) => <Pill tone={statusTone(turn.status)}>{t.admin.turns.statuses[turn.status]}</Pill>,
        },
        {
          key: "preview",
          header: tc.preview,
          className: "max-w-[24rem]",
          cell: (turn) => (
            <span className="block truncate text-text-secondary" title={turn.question_preview}>
              {turn.question_preview}
            </span>
          ),
        },
      ]}
    />
  );
}
