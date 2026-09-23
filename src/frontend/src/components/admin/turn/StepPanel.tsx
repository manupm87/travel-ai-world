"use client";

import { ArrowDownRight } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { JsonView } from "./InspectorParts";
import { kbId } from "./retrievals";
import type { Navigate, Span } from "./types";

function isScalar(value: unknown): value is string | number | boolean | null {
  return value === null || ["string", "number", "boolean"].includes(typeof value);
}

/**
 * One step's payload, opened under its waterfall row: scalars as key/value
 * rows, objects and lists as pretty JSON, all in mono. A search also offers
 * the way to its city-kb panel.
 */
export function StepPanel({ span, id, onNavigate }: { span: Span; id: string; onNavigate: Navigate }) {
  const { t } = useLanguage();
  const tt = t.admin.turn.trace;
  const entries = Object.entries(span.payload);
  const scalars = entries.filter(([, value]) => isScalar(value));
  const nested = entries.filter(([, value]) => !isScalar(value));

  return (
    <div id={id} className="mb-2 mt-1 min-w-0 rounded-lg border border-border bg-bg-surface p-3 text-xs">
      {span.message && (
        <p className="mb-2 text-text-primary">
          <span className="text-text-secondary">{tt.message}: </span>
          {span.message}
        </p>
      )}
      {scalars.length > 0 && (
        <dl className="grid grid-cols-[max-content_minmax(0,1fr)] gap-x-4 gap-y-1 font-mono">
          {scalars.map(([key, value]) => (
            <div key={key} className="contents">
              <dt className="text-text-secondary">{key}</dt>
              <dd className="min-w-0 break-words text-text-primary">{String(value)}</dd>
            </div>
          ))}
        </dl>
      )}
      {nested.map(([key, value]) => (
        <div key={key} className="mt-2">
          <p className="mb-1 font-mono text-text-secondary">{key}</p>
          <JsonView value={value} className="max-h-60 bg-bg-card" />
        </div>
      ))}
      {span.kind === "retriever" && (
        <button
          type="button"
          onClick={() => onNavigate(kbId(span.seq), "kb")}
          className="mt-3 inline-flex items-center gap-1 rounded text-xs font-medium text-accent hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
        >
          <ArrowDownRight size={13} aria-hidden="true" />
          {tt.goToKb}
        </button>
      )}
    </div>
  );
}
