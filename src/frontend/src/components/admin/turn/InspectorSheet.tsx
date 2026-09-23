"use client";

import { useId, useRef, type KeyboardEvent, type ReactNode } from "react";
import { useLanguage } from "@/context/LanguageContext";
import { useFormatters } from "@/hooks/useFormatters";
import { interpolate } from "@/i18n";
import type { TurnDetail } from "@/services/admin";
import { cn } from "@/utils/cn";
import type { InspectorTab } from "./types";

export const SHEET_TABS: readonly InspectorTab[] = ["trace", "kb", "model", "events"];

/**
 * The inspector on a phone (TRA-228, the board "Admin en móvil"): a sheet
 * fixed to the bottom. Collapsed it is a handle, the title and the action;
 * the handle (a button: tap, Enter or Space) opens it to 85dvh with four
 * figures and the tabs Trace / city-kb / Model / Events. It scrolls inside
 * itself; Escape folds it back and returns the focus to the handle.
 */
export function InspectorSheet({
  turn,
  open,
  onOpenChange,
  tab,
  onTabChange,
  nav,
  children,
}: {
  turn: TurnDetail;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tab: InspectorTab;
  onTabChange: (tab: InspectorTab) => void;
  /** The session position and previous / next, above the figures. */
  nav: ReactNode;
  /** The active tab's sections. */
  children: ReactNode;
}) {
  const { t } = useLanguage();
  const tt = t.admin.turn;
  const ts = tt.sheet;
  const f = useFormatters();
  const base = useId();
  const handle = useRef<HTMLButtonElement>(null);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const s = turn.summary;

  const stats: { id: string; label: string; value: ReactNode }[] = [
    {
      id: "model",
      label: ts.stats.model,
      value: s.model ? <span className="font-mono">{s.model}</span> : t.admin.common.none,
    },
    { id: "duration", label: ts.stats.duration, value: f.formatMs(s.latency_ms) },
    {
      id: "calls",
      label: ts.stats.calls,
      value: interpolate(ts.callsValue, { count: f.formatNumber(s.llm_calls) }),
    },
    {
      id: "searches",
      label: ts.stats.searches,
      value: interpolate(ts.searchesValue, { count: f.formatNumber(s.retrievals) }),
    },
  ];

  const onTabKey = (event: KeyboardEvent<HTMLButtonElement>) => {
    const index = SHEET_TABS.indexOf(tab);
    const moves: Record<string, number> = {
      ArrowRight: index + 1,
      ArrowLeft: index - 1,
      Home: 0,
      End: SHEET_TABS.length - 1,
    };
    if (!(event.key in moves)) return;
    event.preventDefault();
    const next = (moves[event.key]! + SHEET_TABS.length) % SHEET_TABS.length;
    onTabChange(SHEET_TABS[next]!);
    tabs.current[next]?.focus();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape" && open) {
      event.stopPropagation();
      onOpenChange(false);
      handle.current?.focus();
    }
  };

  return (
    <div
      role="region"
      aria-label={tt.inspector.title}
      data-open={open}
      onKeyDown={onKeyDown}
      className={cn(
        "fixed inset-x-0 bottom-0 z-30 flex flex-col rounded-t-2xl border border-b-0 border-border-card bg-bg-card shadow-[0_-12px_32px_rgba(0,0,0,0.25)]",
        open && "h-[85dvh]"
      )}
    >
      <button
        ref={handle}
        type="button"
        aria-expanded={open}
        aria-controls={open ? `${base}-body` : undefined}
        aria-label={open ? ts.collapse : ts.expand}
        onClick={() => onOpenChange(!open)}
        className="flex w-full shrink-0 flex-col items-stretch gap-2 rounded-t-2xl px-4 pb-3 pt-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent/50"
      >
        <span aria-hidden="true" className="mx-auto h-1 w-10 rounded-full bg-border-soft" />
        <span className="flex min-w-0 items-baseline justify-between gap-3">
          <span className="shrink-0 text-lg text-text-primary">{tt.inspector.title}</span>
          {s.action && (
            <span className="min-w-0 truncate font-mono text-xs text-text-secondary">{s.action}</span>
          )}
        </span>
      </button>

      {open && (
        <div id={`${base}-body`} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-6">
          <div className="mb-3">{nav}</div>
          <ul className="mb-4 grid grid-cols-2 gap-2">
            {stats.map((stat) => (
              <li
                key={stat.id}
                data-stat={stat.id}
                className="min-w-0 rounded-xl border border-border-card bg-bg-surface px-3 py-2"
              >
                <p className="truncate text-xs text-text-secondary">{stat.label}</p>
                <p className="mt-0.5 truncate text-sm font-medium tabular-nums text-text-primary">
                  {stat.value}
                </p>
              </li>
            ))}
          </ul>
          <div
            role="tablist"
            aria-label={ts.tabs}
            className="mb-4 grid grid-cols-4 gap-1 rounded-xl bg-bg-surface p-1"
          >
            {SHEET_TABS.map((id, index) => (
              <button
                key={id}
                ref={(el) => {
                  tabs.current[index] = el;
                }}
                type="button"
                role="tab"
                id={`${base}-tab-${id}`}
                aria-selected={tab === id}
                aria-controls={`${base}-panel`}
                tabIndex={tab === id ? 0 : -1}
                onClick={() => onTabChange(id)}
                onKeyDown={onTabKey}
                className={cn(
                  "min-w-0 truncate rounded-lg px-1 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50",
                  tab === id
                    ? "bg-bg-card font-medium text-text-primary shadow-sm"
                    : "text-text-secondary hover:text-text-primary"
                )}
              >
                {ts.tab[id]}
              </button>
            ))}
          </div>
          <div
            role="tabpanel"
            id={`${base}-panel`}
            aria-labelledby={`${base}-tab-${tab}`}
            className="flex min-w-0 flex-col gap-4"
          >
            {children}
          </div>
        </div>
      )}
    </div>
  );
}
