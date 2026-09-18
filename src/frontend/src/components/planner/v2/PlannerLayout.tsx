"use client";

import { useId, useState, type KeyboardEvent, type ReactNode } from "react";
import { useLanguage } from "@/context/LanguageContext";
import { cn } from "@/utils/cn";

export type PlannerTab = "chat" | "trip" | "map";

const TABS = ["chat", "trip", "map"] as const satisfies readonly PlannerTab[];

export interface PlannerLayoutProps {
  chat: ReactNode;
  panel: ReactNode;
  /** Shown on its own tab on small screens; on desktop the panel embeds it. */
  map: ReactNode;
}

/**
 * Layout A: two columns on desktop (chat ~38 %, trip panel the rest), both
 * scrolling independently under the fixed header; on small screens three
 * tabs (Chat / Trip / Map) over one full-height pane.
 */
export function PlannerLayout({ chat, panel, map }: PlannerLayoutProps) {
  const { t } = useLanguage();
  const [tab, setTab] = useState<PlannerTab>("chat");
  const baseId = useId();

  const tabId = (name: PlannerTab) => `${baseId}-tab-${name}`;
  const panelId = (name: PlannerTab) => `${baseId}-panel-${name}`;

  const onTabKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const index = TABS.indexOf(tab);
    let next: PlannerTab | null = null;
    if (event.key === "ArrowRight") next = TABS[(index + 1) % TABS.length] ?? null;
    if (event.key === "ArrowLeft") next = TABS[(index - 1 + TABS.length) % TABS.length] ?? null;
    if (event.key === "Home") next = TABS[0];
    if (event.key === "End") next = TABS[TABS.length - 1] ?? null;
    if (!next) return;
    event.preventDefault();
    setTab(next);
    document.getElementById(tabId(next))?.focus();
  };

  return (
    <div className="flex h-[calc(100vh-var(--header-h))] min-h-0 flex-col">
      <h1 className="sr-only">{t.plan.title}</h1>

      {/* Small screens: tabs. The tab roles stay on the panes at every width:
          above `lg` the tablist is hidden and the three panes simply show,
          which assistive technology reads as three regions. */}
      <div
        role="tablist"
        aria-label={t.plan.title}
        onKeyDown={onTabKeyDown}
        className="flex shrink-0 border-b border-border bg-bg-primary px-4 lg:hidden"
      >
        {TABS.map((name) => {
          const active = tab === name;
          return (
            <button
              key={name}
              id={tabId(name)}
              type="button"
              role="tab"
              aria-selected={active}
              aria-controls={panelId(name)}
              tabIndex={active ? 0 : -1}
              onClick={() => setTab(name)}
              className={cn(
                "-mb-px flex-1 border-b-2 px-3 py-3 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40",
                active
                  ? "border-accent text-text-primary"
                  : "border-transparent text-text-secondary hover:text-text-primary"
              )}
            >
              {t.plan.tabs[name]}
            </button>
          );
        })}
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(0,38fr)_minmax(0,62fr)]">
        {/* Visibility is class-based on purpose: the `hidden` attribute is
            `display: none !important` in Tailwind's preflight and would beat
            the desktop override, where every pane shows. */}
        <section
          id={panelId("chat")}
          role="tabpanel"
          aria-labelledby={tabId("chat")}
          className={cn(
            "min-h-0 flex-col border-border p-4 lg:flex lg:border-r",
            tab === "chat" ? "flex" : "hidden"
          )}
        >
          {chat}
        </section>
        <section
          id={panelId("trip")}
          role="tabpanel"
          aria-labelledby={tabId("trip")}
          className={cn(
            "min-h-0 overflow-y-auto bg-bg-secondary lg:block",
            tab === "trip" ? "block" : "hidden"
          )}
        >
          {panel}
        </section>
        <section
          id={panelId("map")}
          role="tabpanel"
          aria-labelledby={tabId("map")}
          className={cn(
            "min-h-0 overflow-y-auto bg-bg-secondary p-4 lg:hidden",
            tab === "map" ? "block" : "hidden"
          )}
        >
          {map}
        </section>
      </div>
    </div>
  );
}
