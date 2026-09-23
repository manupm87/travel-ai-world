"use client";

import { Cpu } from "lucide-react";
import { useId, useRef, useState, type KeyboardEvent } from "react";
import { Pill } from "@/components/admin/Pill";
import { useLanguage } from "@/context/LanguageContext";
import { useFormatters } from "@/hooks/useFormatters";
import { interpolate } from "@/i18n";
import type { TurnDetail } from "@/services/admin";
import { cn } from "@/utils/cn";
import { InspectorSection, JsonView } from "./InspectorParts";
import { SECTION_IDS, type Mark } from "./marks";
import { modelCalls, type ModelCallTab, type ValidationChip } from "./modelCalls";

/**
 * Every model call's output (TRA-228): one tab per `llm` step, the output as
 * pretty JSON (or text), a caption with the model, tokens and time to first
 * chunk, and the validation chips.
 */
export function ModelCalls({ turn, marks }: { turn: TurnDetail; marks: Mark[] }) {
  const { t } = useLanguage();
  const tm = t.admin.turn.calls;
  const f = useFormatters();
  const base = useId();
  const tabs = modelCalls(turn.spans, turn.summary.prices_stripped);
  const [selected, setSelected] = useState(0);
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const index = Math.min(selected, Math.max(tabs.length - 1, 0));
  const current = tabs[index];

  const label = (tab: ModelCallTab) =>
    tab.day === null ? tab.label : `${tab.label}, ${interpolate(tm.day, { day: tab.day })}`;

  const chipText = (chip: ValidationChip) => {
    if (chip.id === "validated") return tm.validated;
    const [one, many] =
      chip.id === "repairs"
        ? [tm.repairOne, tm.repairs]
        : chip.id === "dropped"
          ? [tm.droppedOne, tm.dropped]
          : [tm.priceOne, tm.prices];
    return chip.count === 1 ? one : interpolate(many, { count: f.formatNumber(chip.count) });
  };

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    const moves: Record<string, number> = {
      ArrowRight: index + 1,
      ArrowLeft: index - 1,
      Home: 0,
      End: tabs.length - 1,
    };
    if (!(event.key in moves)) return;
    event.preventDefault();
    const next = (moves[event.key]! + tabs.length) % tabs.length;
    setSelected(next);
    refs.current[next]?.focus();
  };

  const caption = (tab: ModelCallTab) => {
    const text = interpolate(tm.caption, {
      model: tab.model ?? t.admin.common.none,
      input: tab.inputTokens === null ? t.admin.common.none : f.formatNumber(tab.inputTokens),
      output: tab.outputTokens === null ? t.admin.common.none : f.formatNumber(tab.outputTokens),
    });
    return tab.ttfcMs === null ? text : text + interpolate(tm.ttfc, { ttfc: f.formatMs(tab.ttfcMs) });
  };

  return (
    <InspectorSection
      id={SECTION_IDS.model}
      title={tm.title}
      icon={Cpu}
      marks={marks}
      aside={current ? label(current) : undefined}
    >
      {!current ? (
        <p className="text-sm text-text-secondary">{tm.empty}</p>
      ) : (
        <>
          <div
            role="tablist"
            aria-label={tm.tabs}
            className="mb-3 flex gap-1 overflow-x-auto pb-1"
          >
            {tabs.map((tab, i) => (
              <button
                key={tab.seq}
                ref={(el) => {
                  refs.current[i] = el;
                }}
                type="button"
                role="tab"
                id={`${base}-tab-${tab.seq}`}
                aria-selected={i === index}
                aria-controls={`${base}-panel`}
                tabIndex={i === index ? 0 : -1}
                onClick={() => setSelected(i)}
                onKeyDown={onKeyDown}
                className={cn(
                  "shrink-0 whitespace-nowrap rounded-md border px-2.5 py-1 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50",
                  i === index
                    ? "border-accent-border bg-accent-soft text-text-primary"
                    : "border-border text-text-secondary hover:text-text-primary"
                )}
              >
                {label(tab)}
              </button>
            ))}
          </div>
          <div role="tabpanel" id={`${base}-panel`} aria-labelledby={`${base}-tab-${current.seq}`}>
            {current.output === null ? (
              <p className="text-sm text-text-secondary">{tm.noOutput}</p>
            ) : current.output.kind === "json" ? (
              <JsonView text={current.output.text} />
            ) : (
              <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-border bg-bg-surface px-3 py-2 font-mono text-xs leading-relaxed text-text-primary">
                {current.output.text}
              </pre>
            )}
            <p className="mt-2 text-xs text-text-secondary">
              {caption(current)}
            </p>
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {current.chips.map((chip) => (
                <li key={chip.id} data-validation={chip.id}>
                  <Pill tone={chip.tone}>{chipText(chip)}</Pill>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </InspectorSection>
  );
}
