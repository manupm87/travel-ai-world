"use client";

/** The planner's layout: two zones on a laptop, two tabs on a phone. */

import { useId, useState, type KeyboardEvent, type ReactNode } from "react";
import { useLanguage } from "@/context/LanguageContext";
import { cn } from "@/utils/cn";

export type PlannerTab = "chat" | "trip";

const TABS: readonly PlannerTab[] = ["chat", "trip"];

export interface PlannerLayoutProps {
  /** Optional strip above the panes (the demo-mode banner); `null` shows none. */
  banner?: ReactNode;
  chat: ReactNode;
  panel: ReactNode;
  /** The map the trip floats over; `null` leaves the trip pane full width with no map. */
  map: ReactNode | null;
}

/**
 * The planner: chat on the left, the trip card floating over the map on the
 * right; on a phone, two tabs with the trip as a sheet over the map.
 * Height is `100dvh`, not `100vh`, which on a phone is taller than the visible
 * viewport and would make the document scroll; only the panes scroll.
 */
export function PlannerLayout({ banner = null, chat, panel, map }: PlannerLayoutProps) {
  const { t } = useLanguage();
  const [tab, setTab] = useState<PlannerTab>("chat");
  const [sheetOpen, setSheetOpen] = useState(false);
  const baseId = useId();

  const hasMap = map !== null;
  const tabId = (name: PlannerTab) => `${baseId}-tab-${name}`;
  const panelId = (name: PlannerTab) => `${baseId}-panel-${name}`;
  const sheetId = `${baseId}-sheet`;

  const onTabKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const index = TABS.indexOf(tab);
    let next: PlannerTab | null = null;
    if (event.key === "ArrowRight") next = TABS[(index + 1) % TABS.length] ?? null;
    if (event.key === "ArrowLeft") next = TABS[(index - 1 + TABS.length) % TABS.length] ?? null;
    if (event.key === "Home") next = TABS[0] ?? null;
    if (event.key === "End") next = TABS[TABS.length - 1] ?? null;
    if (!next) return;
    event.preventDefault();
    setTab(next);
    document.getElementById(tabId(next))?.focus();
  };

  return (
    <div className="flex h-[calc(100dvh-var(--header-h))] min-h-0 flex-col">
      <h1 className="sr-only">{t.plan.title}</h1>

      {banner && <div className="shrink-0">{banner}</div>}

      {/* the tab roles stay at every width: above `lg` the tablist is hidden and both panes show */}
      <div className="shrink-0 px-3 pt-1 pb-2 lg:hidden">
        <div
          role="tablist"
          aria-label={t.plan.title}
          onKeyDown={onTabKeyDown}
          className="grid grid-cols-2 gap-1 rounded-full border border-glass-border bg-glass-bg p-1 backdrop-blur-xl"
        >
          {TABS.map((name) => {
            const selected = tab === name;
            return (
              <button
                key={name}
                id={tabId(name)}
                type="button"
                role="tab"
                aria-selected={selected}
                aria-controls={panelId(name)}
                tabIndex={selected ? 0 : -1}
                onClick={() => setTab(name)}
                className={cn(
                  "h-9 rounded-full text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40",
                  selected
                    ? "bg-action text-on-action"
                    : "text-text-secondary hover:text-text-primary"
                )}
              >
                {t.plan.tabs[name]}
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(340px,420px)_minmax(0,1fr)]">
        {/* visibility is class-based: the `hidden` attribute is `display: none !important`
            in Tailwind's preflight and would beat the desktop override */}
        <section
          id={panelId("chat")}
          role="tabpanel"
          aria-labelledby={tabId("chat")}
          className={cn(
            "planner-sky min-h-0 flex-col border-glass-border p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] lg:flex lg:border-r lg:p-4 lg:pb-4",
            // no remount on tab change, so the pane keeps its state; the fade runs when the class appears
            tab === "chat" ? "flex animate-fade-in" : "hidden"
          )}
        >
          {chat}
        </section>

        <section
          id={panelId("trip")}
          role="tabpanel"
          aria-labelledby={tabId("trip")}
          className={cn(
            "relative min-h-0 overflow-hidden bg-bg-surface lg:block",
            tab === "trip" ? "block animate-fade-in" : "hidden"
          )}
        >
          {hasMap && <div className="absolute inset-0">{map}</div>}

          <div
            id={sheetId}
            data-sheet={sheetOpen ? "open" : "peek"}
            className={cn(
              "flex min-h-0 flex-col",
              hasMap
                ? [
                    // phone: a sheet over the lower part of the map
                    "absolute inset-x-0 bottom-0 rounded-t-3xl border-t border-glass-border bg-bg-secondary/95 shadow-[0_-18px_40px_-20px_rgba(0,0,0,0.6)] backdrop-blur-xl transition-[height] duration-300 ease-out",
                    sheetOpen ? "h-[92%]" : "h-[58%]",
                    // desktop: a card floating over the left of the map
                    "lg:top-4 lg:bottom-4 lg:left-4 lg:h-auto lg:w-[min(460px,calc(100%-2rem))] lg:rounded-3xl lg:border lg:shadow-field-glow",
                  ]
                : "absolute inset-0 bg-bg-secondary"
            )}
          >
            {hasMap && (
              <button
                type="button"
                onClick={() => setSheetOpen((open) => !open)}
                aria-expanded={sheetOpen}
                aria-controls={sheetId}
                aria-label={sheetOpen ? t.plan.sheet.collapse : t.plan.sheet.expand}
                className="flex h-7 shrink-0 items-center justify-center rounded-t-3xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 lg:hidden"
              >
                <span aria-hidden="true" className="h-1 w-10 rounded-full bg-text-muted/60" />
              </button>
            )}
            <div className="min-h-0 flex-1 scrollbar-none overflow-y-auto overscroll-y-contain pb-[env(safe-area-inset-bottom)] lg:rounded-3xl lg:pb-0">
              {panel}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
