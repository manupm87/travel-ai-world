"use client";

import { ListChecks } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { interpolate } from "@/i18n";
import { useBriefValues } from "@/hooks/useBriefValues";
import { BRIEF_FIELDS, type BriefField, type TripBrief } from "@/types/planner";
import { cn } from "@/utils/cn";

/** Every field but the destination, which the tag carries as its title. */
const TAG_FIELDS = BRIEF_FIELDS.filter((field) => field !== "destination");

export interface LuggageTagProps {
  brief: TripBrief;
  missing: BriefField[];
}

/**
 * Kiri asking before she closes the suitcase (TRA-239): the brief as a luggage
 * tag — the destination large, then each detail, with a dashed "To decide"
 * where the chat still has to answer. It sits over the quick replies that
 * answer it, and says how many details are missing.
 */
export function LuggageTag({ brief, missing }: LuggageTagProps) {
  const { t } = useLanguage();
  const p = t.plan.packing.tag;
  const values = useBriefValues(brief);
  const labels = t.plan.checklist.fields;

  return (
    <div className="flex animate-fade-up flex-col gap-2">
      <p className="flex flex-wrap items-center gap-x-2 text-[14px]">
        <ListChecks size={15} aria-hidden="true" className="text-accent" />
        <span className="font-semibold text-text-primary">{p.heading}</span>
        <span className="text-[12px] text-text-muted">
          {missing.length === 1 ? p.missingOne : interpolate(p.missing, { count: missing.length })}
        </span>
      </p>

      <section
        aria-label={p.title}
        className="relative ml-4 rounded-r-2xl border border-glass-border bg-bg-card py-3.5 pr-4 pl-8 [clip-path:polygon(14px_0,100%_0,100%_100%,14px_100%,0_50%)]"
      >
        {/* The tag's eyelet, where the string goes through. */}
        <span
          aria-hidden="true"
          className="absolute top-1/2 left-4 h-2.5 w-2.5 -translate-y-1/2 rounded-full border-2 border-text-secondary"
        />
        <span className="text-[11.5px] text-text-muted">{p.title}</span>
        <p className="font-heading text-[22px] leading-tight text-text-primary">
          {values.destination ?? p.toDecide}
        </p>
        <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2">
          {TAG_FIELDS.map((field) => {
            const value = values[field];
            const open = value === null || missing.includes(field);
            return (
              <div key={field} className="flex min-w-0 flex-col" data-field={field}>
                <dt className="text-[11px] text-text-muted">{labels[field]}</dt>
                <dd
                  className={cn(
                    "self-start truncate text-[13.5px] font-semibold text-text-primary",
                    open && "rounded-md border border-dashed border-text-muted px-1.5"
                  )}
                >
                  {open ? p.toDecide : value}
                </dd>
              </div>
            );
          })}
        </dl>
      </section>
    </div>
  );
}
