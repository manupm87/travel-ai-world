"use client";

import { Send } from "lucide-react";
import { useMemo } from "react";
import { Pill } from "@/components/admin/Pill";
import { useLanguage } from "@/context/LanguageContext";
import { useFormatters } from "@/hooks/useFormatters";
import { interpolate } from "@/i18n";
import type { TurnDetail } from "@/services/admin";
import { cn } from "@/utils/cn";
import { InspectorSection } from "./InspectorParts";
import { SECTION_IDS, type Mark } from "./marks";

/** The SSE timeline: when each event left (seconds, two decimals), its type and summary, then the end of the stream. */
export function EventTimeline({ turn, marks = [] }: { turn: TurnDetail; marks?: Mark[] }) {
  const { t, locale } = useLanguage();
  const te = t.admin.turn.events;
  const f = useFormatters();
  const seconds = useMemo(
    () => new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    [locale]
  );
  const count = turn.timeline.length;

  const summary = (type: string, text: string, n: number) => {
    if (type === "text") return n === 1 ? te.deltaOne : interpolate(te.deltas, { count: f.formatNumber(n) });
    return text;
  };

  return (
    <InspectorSection
      id={SECTION_IDS.events}
      title={te.title}
      icon={Send}
      marks={marks}
      aside={
        <span data-testid="events-count">
          {count === 1 ? te.countOne : interpolate(te.count, { count: f.formatNumber(count) })}
        </span>
      }
    >
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left text-xs">
          <caption className="sr-only">{te.caption}</caption>
          <thead className="sr-only">
            <tr>
              <th scope="col">{te.time}</th>
              <th scope="col">{te.type}</th>
              <th scope="col">{te.summary}</th>
            </tr>
          </thead>
          <tbody>
            {turn.timeline.map((mark, index) => (
              <tr key={`${mark.t_ms}-${index}`} data-event={mark.type} className="border-b border-border">
                <td className="w-12 py-1.5 pr-3 text-right tabular-nums text-text-secondary">
                  {seconds.format(mark.t_ms / 1000)}
                </td>
                <td className="whitespace-nowrap py-1.5 pr-3 font-mono text-text-primary">{mark.type}</td>
                <td className="py-1.5">
                  <span className="inline-flex flex-wrap items-center gap-2">
                    <span className={cn("break-all text-text-secondary", mark.type !== "text" && "font-mono")}>
                      {summary(mark.type, mark.summary, mark.count)}
                    </span>
                    {/warn/i.test(mark.summary) && <Pill tone="gold">{te.warning}</Pill>}
                  </span>
                </td>
              </tr>
            ))}
            <tr data-event="end">
              <td className="w-12 py-1.5 pr-3 text-right tabular-nums text-text-secondary">
                {seconds.format(turn.summary.latency_ms / 1000)}
              </td>
              <td className="whitespace-nowrap py-1.5 pr-3 font-mono text-text-primary">[DONE]</td>
              <td className="py-1.5 text-text-secondary">{te.end}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </InspectorSection>
  );
}
