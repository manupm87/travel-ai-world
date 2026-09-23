"use client";

import { BookOpen, Check, Minus } from "lucide-react";
import { useMemo } from "react";
import { Pill } from "@/components/admin/Pill";
import { useLanguage } from "@/context/LanguageContext";
import { useFormatters } from "@/hooks/useFormatters";
import { interpolate } from "@/i18n";
import type { Translations } from "@/i18n/types";
import { InspectorSection } from "./InspectorParts";
import type { Mark } from "./marks";
import { kbId, type FilterChip, type Purpose, type RetrievalView } from "./retrievals";

type Kb = Translations["admin"]["turn"]["kb"];

function purposeText(purpose: Purpose, kb: Kb, parts: Translations["plan"]["parts"]): string {
  if (purpose.key === "candidatesDay") {
    return interpolate(kb.purposes.candidatesDay, { day: purpose.day, part: parts[purpose.part].toLowerCase() });
  }
  if (purpose.key === "other") return purpose.raw;
  return kb.purposes[purpose.key];
}

function chipText(chip: FilterChip): string {
  switch (chip.key) {
    case "city":
      return `city = ${chip.value}`;
    case "category":
      return `category: ${chip.value.join(", ")}`;
    case "district":
      return `district: ${chip.value.join(", ")}`;
    case "kind":
      return `kind: ${chip.value.join(", ")}`;
    case "price":
      return `price ≤ ${chip.value}`;
  }
}

/** A filter as it was sent: mono, because it is the query's own vocabulary. */
function Chip({ children }: { children: string }) {
  return (
    <span className="whitespace-nowrap rounded-md border border-border-soft bg-bg-surface px-1.5 py-0.5 font-mono text-[11px] text-text-primary">
      {children}
    </span>
  );
}

/**
 * One city-kb search (TRA-228): its purpose and query, the filters that were
 * set, `k` and the ladder step, the embeddings model, and every result with
 * whether the turn used it and its cosine distance as a bar.
 */
export function RetrievalPanel({ view, marks = [] }: { view: RetrievalView; marks?: Mark[] }) {
  const { t, locale } = useLanguage();
  const kb = t.admin.turn.kb;
  const f = useFormatters();
  const three = useMemo(
    () => new Intl.NumberFormat(locale, { minimumFractionDigits: 3, maximumFractionDigits: 3 }),
    [locale]
  );
  const columns = kb.columns;
  const purpose = view.purpose ? purposeText(view.purpose, kb, t.plan.parts) : null;

  return (
    <InspectorSection
      id={kbId(view.seq)}
      title={kb.title}
      icon={BookOpen}
      marks={marks}
      aside={
        <span className="flex min-w-0 flex-wrap items-center justify-end gap-x-2">
          {purpose && <span>{purpose}</span>}
          {view.noHit && <Pill tone="gold">no_hit</Pill>}
        </span>
      }
    >
      {view.query && (
        <p className="mb-2 break-words text-xs text-text-secondary" title={view.query}>
          {view.query}
        </p>
      )}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <span className="text-xs text-text-secondary">{kb.filters}</span>
          {view.chips.map((chip) => (
            <Chip key={chip.key}>{chipText(chip)}</Chip>
          ))}
          {view.k !== null && <Chip>{`k = ${view.k}`}</Chip>}
          {view.ladderStep !== null && (
            <span className="text-xs text-text-secondary">
              {interpolate(kb.ladder, { step: view.ladderStep })}
            </span>
          )}
        </div>
        {view.embeddingModel && (
          <div className="flex min-w-0 items-center gap-1.5">
            <span className="text-xs text-text-secondary">{kb.embeddings}</span>
            <Chip>{view.embeddingModel}</Chip>
          </div>
        )}
      </div>

      {view.rows.length === 0 ? (
        <p className="py-3 text-sm text-text-secondary">{kb.noResults}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[34rem] border-collapse text-left text-xs">
            <caption className="sr-only">{interpolate(kb.caption, { seq: view.seq })}</caption>
            <thead>
              <tr className="border-b border-border text-text-secondary">
                <th scope="col" className="w-6 py-1.5 pr-2 font-medium">
                  <span className="sr-only">{columns.used}</span>
                </th>
                <th scope="col" className="py-1.5 pr-3 font-medium">{columns.document}</th>
                <th scope="col" className="py-1.5 pr-3 font-medium">{columns.id}</th>
                <th scope="col" className="py-1.5 pr-3 font-medium">{columns.category}</th>
                <th scope="col" className="py-1.5 pr-3 font-medium">{columns.district}</th>
                <th scope="col" className="py-1.5 text-right font-medium">{columns.distance}</th>
              </tr>
            </thead>
            <tbody>
              {view.rows.map(({ doc, bar }) => (
                <tr key={`${doc.rank}-${doc.doc_id}`} data-used={doc.used} className="border-b border-border last:border-b-0">
                  <td className="py-1.5 pr-2">
                    {doc.used ? (
                      <Check size={14} className="text-success" aria-label={kb.usedYes} role="img" />
                    ) : (
                      <Minus size={14} className="text-text-muted" aria-label={kb.usedNo} role="img" />
                    )}
                  </td>
                  <td className="max-w-[14rem] truncate py-1.5 pr-3 font-medium text-text-primary" title={doc.title ?? doc.doc_id}>
                    {doc.title ?? <span className="font-mono">{doc.doc_id}</span>}
                  </td>
                  <td className="max-w-[12rem] truncate py-1.5 pr-3 font-mono text-text-secondary" title={doc.doc_id}>
                    {doc.doc_id}
                  </td>
                  <td className="py-1.5 pr-3 text-text-secondary">{doc.category ?? t.admin.common.none}</td>
                  <td className="py-1.5 pr-3 text-text-secondary">{doc.district ?? t.admin.common.none}</td>
                  <td className="py-1.5">
                    <span className="flex items-center justify-end gap-2">
                      <span aria-hidden="true" className="relative h-1.5 w-16 rounded-full bg-bg-surface">
                        <span
                          className="absolute inset-y-0 left-0 rounded-full bg-success"
                          style={{ width: `${Math.round(bar * 100)}%` }}
                        />
                      </span>
                      <span className="w-12 text-right tabular-nums text-text-primary">
                        {doc.distance === null ? t.admin.common.none : three.format(doc.distance)}
                      </span>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-2 text-xs text-text-secondary">
        {interpolate(kb.footnote, {
          used: f.formatNumber(view.used),
          k: f.formatNumber(view.k ?? view.rows.length),
        })}
      </p>
    </InspectorSection>
  );
}
