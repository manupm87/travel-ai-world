"use client";

import { useId, useState, type KeyboardEvent, type ReactNode } from "react";
import { useLanguage } from "@/context/LanguageContext";
import { cn } from "@/utils/cn";

export type PlannerTab = "chat" | "trip" | "map";

export interface PlannerLayoutProps {
  /** Optional strip above the tabs (the demo-mode banner); `null` shows none. */
  banner?: ReactNode;
  chat: ReactNode;
  panel: ReactNode;
  /**
   * The third desktop column; on small screens its own tab (TRA-147). `null`
   * is the trip overview (TRA-177): there is no day to map, so the column and
   * its tab are simply not there and the trip pane takes the width.
   */
  map: ReactNode | null;
}

/**
 * Layout A: three columns on desktop (chat ~30 %, trip panel ~40 %, map ~30 %)
 * under the fixed header — the panel scrolls on its own, the map fills its
 * column and the page never scrolls; on small screens the same three panes
 * become tabs (Chat / Trip / Map) over one full-height pane.
 *
 * Without a map there are two of each: the trip pane spans what the map left
 * (chat ~30 %, trip ~70 %) and keeps its own scroller, and the tablist offers
 * Chat and Trip alone.
 *
 * The height is `100dvh`, not `100vh` (TRA-187): on a phone `100vh` is the
 * viewport with the browser's toolbars hidden, so a `vh` pane is taller than
 * what you can see, the composer sits under the fold and the document itself
 * starts scrolling — which is exactly what this layout promises it never does.
 * `dvh` follows the visible viewport instead. The panes are therefore the only
 * scrollers, and they say so with `overscroll-y-contain`, so reaching the end
 * of one does not rubber-band the page behind it. The pane that touches the
 * bottom edge pads itself with `env(safe-area-inset-bottom)`, which
 * `viewportFit: "cover"` (root layout) makes non-zero.
 */
export function PlannerLayout({ banner = null, chat, panel, map }: PlannerLayoutProps) {
  const { t } = useLanguage();
  const [tab, setTab] = useState<PlannerTab>("chat");
  const baseId = useId();

  const hasMap = map !== null;
  const tabs: readonly PlannerTab[] = hasMap ? ["chat", "trip", "map"] : ["chat", "trip"];

  // The map can disappear under the active tab (the traveller goes back to the
  // overview from the Map pane). Adjusted while rendering, as `useSelectedDay`
  // adjusts the day: React re-runs this component before touching the DOM, so
  // no pane without a tab is ever painted.
  if (!hasMap && tab === "map") setTab("trip");
  const active: PlannerTab = !hasMap && tab === "map" ? "trip" : tab;

  const tabId = (name: PlannerTab) => `${baseId}-tab-${name}`;
  const panelId = (name: PlannerTab) => `${baseId}-panel-${name}`;

  const onTabKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const index = tabs.indexOf(active);
    let next: PlannerTab | null = null;
    if (event.key === "ArrowRight") next = tabs[(index + 1) % tabs.length] ?? null;
    if (event.key === "ArrowLeft") next = tabs[(index - 1 + tabs.length) % tabs.length] ?? null;
    if (event.key === "Home") next = tabs[0] ?? null;
    if (event.key === "End") next = tabs[tabs.length - 1] ?? null;
    if (!next) return;
    event.preventDefault();
    setTab(next);
    document.getElementById(tabId(next))?.focus();
  };

  return (
    <div className="flex h-[calc(100dvh-var(--header-h))] min-h-0 flex-col">
      <h1 className="sr-only">{t.plan.title}</h1>

      {banner && <div className="shrink-0">{banner}</div>}

      {/* Small screens: tabs. The tab roles stay on the panes at every width:
          above `lg` the tablist is hidden and the three panes simply show,
          which assistive technology reads as three regions. */}
      <div
        role="tablist"
        aria-label={t.plan.title}
        onKeyDown={onTabKeyDown}
        className="flex shrink-0 border-b border-border bg-bg-primary px-4 lg:hidden"
      >
        {tabs.map((name) => {
          const selected = active === name;
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
                "-mb-px flex-1 border-b-2 px-3 py-3 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40",
                selected
                  ? "border-accent text-text-primary"
                  : "border-transparent text-text-secondary hover:text-text-primary"
              )}
            >
              {t.plan.tabs[name]}
            </button>
          );
        })}
      </div>

      <div
        className={cn(
          "grid min-h-0 flex-1 grid-cols-1",
          hasMap
            ? "lg:grid-cols-[minmax(0,3fr)_minmax(0,4fr)_minmax(0,3fr)]"
            : "lg:grid-cols-[minmax(0,3fr)_minmax(0,7fr)]"
        )}
      >
        {/* Visibility is class-based on purpose: the `hidden` attribute is
            `display: none !important` in Tailwind's preflight and would beat
            the desktop override, where every pane shows. */}
        <section
          id={panelId("chat")}
          role="tabpanel"
          aria-labelledby={tabId("chat")}
          className={cn(
            "min-h-0 flex-col border-border p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] lg:flex lg:border-r lg:p-4 lg:pb-4",
            // The fade runs when the class appears, i.e. when the tab becomes
            // the active one: no remount, so the pane keeps its own state.
            active === "chat" ? "flex animate-fade-in" : "hidden"
          )}
        >
          {chat}
        </section>
        <section
          id={panelId("trip")}
          role="tabpanel"
          aria-labelledby={tabId("trip")}
          className={cn(
            "min-h-0 overflow-y-auto overscroll-y-contain bg-bg-secondary lg:block",
            active === "trip" ? "block animate-fade-in" : "hidden"
          )}
        >
          {panel}
        </section>
        {hasMap && (
          <section
            id={panelId("map")}
            role="tabpanel"
            aria-labelledby={tabId("map")}
            className={cn(
              // No padding and no scroller of its own: the map fills the pane.
              "min-h-0 bg-bg-secondary lg:block lg:min-w-[280px] lg:border-l lg:border-border",
              active === "map" ? "block animate-fade-in" : "hidden"
            )}
          >
            {map}
          </section>
        )}
      </div>
    </div>
  );
}
