"use client";

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
  /**
   * The map the trip floats over (TRA-238). `null` leaves the trip pane on
   * its own, full width, with no map behind it.
   */
  map: ReactNode | null;
}

/**
 * The planner in two zones (TRA-238, the canvas's "Planificador"): the chat
 * on the left and the trip on the right, where the map is the background and
 * the day — or the whole-trip overview — floats over it as a card. On a phone
 * the two zones are two tabs, Chat and Trip; in the Trip tab the map fills the
 * screen and the day is a sheet over its lower part that grows to take the
 * screen and shrinks back to show the map.
 *
 * The height is `100dvh`, not `100vh` (TRA-187): on a phone `100vh` is the
 * viewport with the browser's toolbars hidden, so a `vh` pane is taller than
 * what you can see, the composer sits under the fold and the document itself
 * starts scrolling — which is exactly what this layout promises it never does.
 * The panes are the only scrollers, and they say so with
 * `overscroll-y-contain`; the one that touches the bottom edge pads itself with
 * `env(safe-area-inset-bottom)`, which `viewportFit: "cover"` makes non-zero.
 */
export function PlannerLayout({ banner = null, chat, panel, map }: PlannerLayoutProps) {
  const { t } = useLanguage();
  const [tab, setTab] = useState<PlannerTab>("chat");
  // The phone's sheet: a part of the screen, or nearly all of it.
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

      {/* Small screens: two tabs as one segmented pill. The tab roles stay on
          the panes at every width: above `lg` the tablist is hidden and both
          panes simply show, which assistive technology reads as two regions. */}
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
        {/* Visibility is class-based on purpose: the `hidden` attribute is
            `display: none !important` in Tailwind's preflight and would beat
            the desktop override, where both panes show. */}
        <section
          id={panelId("chat")}
          role="tabpanel"
          aria-labelledby={tabId("chat")}
          className={cn(
            "planner-sky min-h-0 flex-col border-glass-border p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] lg:flex lg:border-r lg:p-4 lg:pb-4",
            // The fade runs when the class appears, i.e. when the tab becomes
            // the active one: no remount, so the pane keeps its own state.
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
                    // The phone: a sheet over the lower part of the map.
                    "absolute inset-x-0 bottom-0 rounded-t-3xl border-t border-glass-border bg-bg-secondary/95 shadow-[0_-18px_40px_-20px_rgba(0,0,0,0.6)] backdrop-blur-xl transition-[height] duration-300 ease-out",
                    sheetOpen ? "h-[92%]" : "h-[58%]",
                    // A desktop: a card floating over the left of the map.
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
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain pb-[env(safe-area-inset-bottom)] lg:rounded-3xl lg:pb-0">
              {panel}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
