"use client";

import type { ReactNode } from "react";
import { useLanguage } from "@/context/LanguageContext";
import { useFormatters } from "@/hooks/useFormatters";
import { interpolate } from "@/i18n";
import type { TurnDetail } from "@/services/admin";
import { fetchCount } from "./retrievals";

interface Chip {
  id: string;
  label: string;
  value: ReactNode;
  /** The full value, for the tooltip when it is truncated. */
  title?: string;
  hint?: string;
}

/** The six figures over the inspector: action, model, calls, searches, tokens, duration. Grid 2 → 3 → 6. */
export function TurnChips({ turn }: { turn: TurnDetail }) {
  const { t } = useLanguage();
  const tc = t.admin.turn.chips;
  const f = useFormatters();
  const s = turn.summary;
  const none = t.admin.common.none;
  const byId = fetchCount(turn.spans);

  const chips: Chip[] = [
    {
      id: "action",
      label: tc.action,
      value: s.action ? <span className="font-mono text-sm">{s.action}</span> : none,
      title: s.action ?? undefined,
    },
    {
      id: "model",
      label: tc.model,
      value: s.model ? <span className="font-mono text-sm">{s.model}</span> : none,
      title: s.model ?? undefined,
      hint: s.provider ?? undefined,
    },
    {
      id: "llmCalls",
      label: tc.llmCalls,
      value: f.formatNumber(s.llm_calls),
      hint:
        s.llm_calls === 0
          ? undefined
          : s.repairs === 0
            ? tc.validated
            : s.repairs === 1
              ? tc.repairOne
              : interpolate(tc.repairs, { count: f.formatNumber(s.repairs) }),
    },
    {
      id: "searches",
      label: tc.searches,
      value: f.formatNumber(s.retrievals),
      hint: byId > 0 ? interpolate(tc.byId, { count: f.formatNumber(byId) }) : undefined,
    },
    {
      id: "tokens",
      label: tc.tokens,
      value: `${f.formatNumber(s.input_tokens)}, ${f.formatNumber(s.output_tokens)}`,
    },
    {
      id: "duration",
      label: tc.duration,
      value: f.formatMs(s.latency_ms),
      hint:
        s.first_event_ms !== null
          ? interpolate(tc.firstEvent, { ms: f.formatMs(s.first_event_ms) })
          : undefined,
    },
  ];

  return (
    <ul aria-label={tc.label} className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
      {chips.map((chip) => (
        <li
          key={chip.id}
          data-chip={chip.id}
          className="min-w-0 rounded-xl border border-border-card bg-bg-card px-3 py-2.5"
        >
          <p className="truncate text-xs text-text-secondary">{chip.label}</p>
          <p className="mt-1 truncate text-base tabular-nums text-text-primary" title={chip.title}>
            {chip.value}
          </p>
          {chip.hint && (
            <p className="mt-0.5 truncate text-xs text-text-secondary" title={chip.hint}>
              {chip.hint}
            </p>
          )}
        </li>
      ))}
    </ul>
  );
}
