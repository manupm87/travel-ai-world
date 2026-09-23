"use client";

import { AlertTriangle, Clock3 } from "lucide-react";
import { useState } from "react";
import { useLanguage } from "@/context/LanguageContext";
import { useFormatters } from "@/hooks/useFormatters";
import { interpolate } from "@/i18n";
import type { TurnDetail } from "@/services/admin";
import { cn } from "@/utils/cn";
import { InspectorSection } from "./InspectorParts";
import { SECTION_IDS, type Mark } from "./marks";
import { StepPanel } from "./StepPanel";
import type { Navigate } from "./types";
import { KIND_BAR, SPAN_KINDS, barStyle, scaleEnd, stepId, waterfall } from "./waterfall";

const FLAG_RING = { warning: "ring-2 ring-gold", error: "ring-2 ring-error" } as const;

/** The legend: one swatch per step kind, and the warning outline. */
function Legend() {
  const { t } = useLanguage();
  const tt = t.admin.turn.trace;
  return (
    <ul aria-label={tt.legend} className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-text-secondary">
      {SPAN_KINDS.map((kind) => (
        <li key={kind} className="inline-flex items-center gap-1.5">
          <span aria-hidden="true" className={cn("h-2.5 w-2.5 rounded-sm", KIND_BAR[kind])} />
          {tt.kinds[kind]}
        </li>
      ))}
      <li className="inline-flex items-center gap-1.5">
        <span aria-hidden="true" className="h-2.5 w-2.5 rounded-sm ring-2 ring-gold" />
        {tt.warning}
      </li>
    </ul>
  );
}

/**
 * The trace as a waterfall (TRA-228): the steps grouped under the five
 * phases, indented under their parent, a bar per step on the turn's time
 * scale coloured by kind, a gold (warning) or red (error) outline when the
 * step says so. Every row is a button that opens the step's payload below it.
 */
export function TraceWaterfall({
  turn,
  marks,
  onNavigate,
}: {
  turn: TurnDetail;
  marks: Mark[];
  onNavigate: Navigate;
}) {
  const { t } = useLanguage();
  const tt = t.admin.turn.trace;
  const f = useFormatters();
  const [open, setOpen] = useState<Set<number>>(() => new Set());
  const groups = waterfall(turn.spans, turn.summary.latency_ms);
  const end = scaleEnd(turn.spans, turn.summary.latency_ms);

  const toggle = (seq: number) =>
    setOpen((current) => {
      const next = new Set(current);
      if (next.has(seq)) next.delete(seq);
      else next.add(seq);
      return next;
    });

  return (
    <InspectorSection
      id={SECTION_IDS.trace}
      title={tt.title}
      icon={Clock3}
      marks={marks}
      aside={<span className="tabular-nums">{interpolate(tt.range, { total: f.formatMs(end) })}</span>}
    >
      <Legend />
      {groups.length === 0 ? (
        <p className="text-sm text-text-secondary">{tt.empty}</p>
      ) : (
        <div className="flex flex-col gap-3">
          {groups.map((group) => (
            <div key={group.phase} data-phase={group.phase}>
              <h4 className="mb-1 border-b border-border pb-1 text-xs text-text-secondary">
                {t.admin.turn.phases[group.phase]}
              </h4>
              <ul>
                {group.rows.map((row) => {
                  const { span } = row;
                  const expanded = open.has(span.seq);
                  const panelId = `${stepId(span.seq)}-panel`;
                  return (
                    <li key={span.seq} data-kind={span.kind} data-level={span.level}>
                      <button
                        type="button"
                        id={stepId(span.seq)}
                        aria-expanded={expanded}
                        aria-controls={expanded ? panelId : undefined}
                        onClick={() => toggle(span.seq)}
                        className="grid w-full scroll-mt-[calc(var(--header-h)+1rem)] grid-cols-[minmax(0,1fr)_minmax(0,1fr)_3.75rem] items-center gap-3 rounded-md px-1 py-1.5 text-left text-xs hover:bg-bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 sm:grid-cols-[minmax(0,1.1fr)_minmax(0,1.4fr)_4rem]"
                      >
                        <span
                          className="flex min-w-0 items-center gap-1.5"
                          style={{ paddingLeft: `${row.depth * 0.875}rem` }}
                        >
                          {row.flag && (
                            <AlertTriangle
                              size={12}
                              aria-hidden="true"
                              className={cn("shrink-0", row.flag === "error" ? "text-error" : "text-gold")}
                            />
                          )}
                          <span className="min-w-0 truncate">
                            <span className="text-text-primary">{span.name}</span>
                            {row.subtitle.length > 0 && (
                              <span className="text-text-secondary">: {row.subtitle.join(", ")}</span>
                            )}
                            <span className="sr-only">
                              {`, ${tt.kinds[span.kind]}`}
                              {row.flag && `, ${row.flag === "error" ? tt.error : tt.warning}`}
                            </span>
                          </span>
                        </span>
                        <span aria-hidden="true" className="relative h-2 min-w-0 rounded-full bg-bg-surface">
                          <span
                            className={cn(
                              "absolute inset-y-0 rounded-full",
                              KIND_BAR[span.kind],
                              row.flag && FLAG_RING[row.flag]
                            )}
                            style={barStyle(row)}
                          />
                        </span>
                        <span className="text-right tabular-nums text-text-secondary">
                          {span.dur_ms === null ? t.admin.common.none : f.formatMs(span.dur_ms)}
                        </span>
                      </button>
                      {expanded && <StepPanel span={span} id={panelId} onNavigate={onNavigate} />}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      )}
    </InspectorSection>
  );
}
