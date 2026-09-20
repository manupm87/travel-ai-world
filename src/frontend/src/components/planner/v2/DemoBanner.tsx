"use client";

import { useState } from "react";
import { FlaskConical, X } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { dismissDemoBanner, isDemoBannerDismissed } from "@/services/plannerDraft";

/**
 * The notice shown while the planner answers from the recorded session
 * instead of ai_api (TRA-158). Dismissable for the tab; it never renders
 * once the real backend answers, so it retires itself with the demo.
 *
 * Below `sm` it says the same thing in one line (`plan.demo.short`): the full
 * paragraph wraps to five lines on a phone and the planner's vertical budget
 * cannot afford them (TRA-187).
 */
export function DemoBanner() {
  const { t } = useLanguage();
  const [dismissed, setDismissed] = useState(() => isDemoBannerDismissed());
  const d = t.plan.demo;

  if (dismissed) return null;

  return (
    <div
      role="status"
      data-testid="demo-banner"
      className="flex items-start gap-3 border-b border-warning/40 bg-warning/10 px-4 py-2 text-sm text-text-primary animate-fade-in sm:py-2.5"
    >
      <FlaskConical size={16} aria-hidden="true" className="mt-0.5 shrink-0 text-warning" />
      <p className="min-w-0 flex-1 leading-snug">
        <span className="font-medium">{d.title}</span>
        <span aria-hidden="true"> · </span>
        {/* Five lines of explanation are a fifth of a phone screen, and the
            planner needs every pixel of it (TRA-187): the short line says the
            same thing, the full one returns from `sm` up. */}
        <span className="text-text-secondary sm:hidden">{d.short}</span>
        <span className="hidden text-text-secondary sm:inline">{d.body}</span>
      </p>
      <button
        type="button"
        onClick={() => {
          dismissDemoBanner();
          setDismissed(true);
        }}
        aria-label={d.dismiss}
        className="shrink-0 rounded-lg p-1 text-text-secondary transition hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
      >
        <X size={16} aria-hidden="true" />
      </button>
    </div>
  );
}
