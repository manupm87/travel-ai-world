"use client";

import { Check } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useLanguage } from "@/context/LanguageContext";
import { useFormatters } from "@/hooks/useFormatters";
import { interpolate } from "@/i18n";
import { BRIEF_FIELDS, type BriefField, type TripBrief } from "@/types/planner";
import { cn } from "@/utils/cn";

export interface BriefChecklistProps {
  brief: TripBrief;
  /** The fields the brief still lacks (`computeMissing`). */
  missing: BriefField[];
  /** A turn is streaming: the button waits. */
  disabled?: boolean;
  onGenerate: () => void;
}

const RING_RADIUS = 18;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

/**
 * The right panel before an itinerary exists: what the brief already knows,
 * what the chat still has to answer, and the button that starts the trip.
 */
export function BriefChecklist({ brief, missing, disabled = false, onGenerate }: BriefChecklistProps) {
  const { t } = useLanguage();
  const { formatDate } = useFormatters();
  const c = t.plan.checklist;

  const total = BRIEF_FIELDS.length;
  const done = total - missing.length;
  const canGenerate = missing.length === 0 && !disabled;

  const dateValue = (): string | null => {
    if (!brief.start_date || !brief.end_date) return null;
    const options: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", timeZone: "UTC" };
    const range = `${formatDate(brief.start_date, options)} – ${formatDate(brief.end_date, options)}`;
    return brief.nights === null
      ? range
      : `${range} · ${brief.nights === 1 ? c.nightOne : interpolate(c.nights, { nights: brief.nights })}`;
  };

  const travellersValue = (): string | null => {
    if (brief.adults === null) return null;
    return brief.children
      ? interpolate(c.adultsAndChildren, { adults: brief.adults, children: brief.children })
      : interpolate(c.adults, { adults: brief.adults });
  };

  const values: Record<BriefField, string | null> = {
    destination: brief.destination,
    origin: brief.origin,
    dates: dateValue(),
    travellers: travellersValue(),
    interests:
      brief.interests.length > 0
        ? brief.interests
            .map((id) => t.plan.quickReplies.interestOptions.find((o) => o.id === id)?.label ?? id)
            .join(", ")
        : null,
  };

  return (
    <Card className="flex flex-col gap-5">
      <div className="flex items-center gap-4">
        <div className="relative flex h-12 w-12 shrink-0 items-center justify-center">
          <svg viewBox="0 0 44 44" aria-hidden="true" className="absolute inset-0 h-full w-full -rotate-90">
            <circle
              cx="22"
              cy="22"
              r={RING_RADIUS}
              fill="none"
              strokeWidth="3"
              className="stroke-border-soft"
            />
            <circle
              cx="22"
              cy="22"
              r={RING_RADIUS}
              fill="none"
              strokeWidth="3"
              strokeLinecap="round"
              strokeDasharray={RING_CIRCUMFERENCE}
              strokeDashoffset={RING_CIRCUMFERENCE * (1 - done / total)}
              className="stroke-accent transition-all duration-500"
            />
          </svg>
          <span className="relative text-xs font-medium text-text-primary">{`${done}/${total}`}</span>
        </div>
        <div className="flex flex-col">
          <h2 className="text-lg font-medium text-text-primary">{c.title}</h2>
          <p className="text-sm text-text-secondary">
            {interpolate(c.progress, { done, total })}
          </p>
        </div>
      </div>

      <ul className="flex flex-col gap-2.5">
        {BRIEF_FIELDS.map((field) => {
          const isDone = !missing.includes(field);
          const value = values[field];
          return (
            <li key={field} className="flex items-start gap-3">
              <span
                // Remounting on the state change replays the pop: the check
                // marks the moment the chat filled that field in.
                key={isDone ? "done" : "pending"}
                data-done={isDone || undefined}
                className={cn(
                  "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border",
                  isDone
                    ? "animate-scale-in border-accent bg-accent text-white"
                    : "border-border-soft text-transparent"
                )}
              >
                <Check size={12} aria-hidden="true" />
              </span>
              <span className="flex flex-col">
                <span className="text-[13px] text-text-secondary">{c.fields[field]}</span>
                <span
                  className={cn(
                    "text-sm",
                    isDone && value ? "text-text-primary" : "italic text-text-muted"
                  )}
                >
                  {isDone && value ? value : c.pending}
                </span>
              </span>
            </li>
          );
        })}
      </ul>

      <div className="flex flex-col gap-2">
        <Button
          size="sm"
          className={cn(
            "w-full px-5 py-3 text-sm transition-shadow duration-300 motion-reduce:transition-none",
            "disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40",
            canGenerate && "shadow-accent-glow"
          )}
          disabled={!canGenerate}
          onClick={onGenerate}
        >
          {c.generate}
        </Button>
        <p className="text-xs leading-snug text-text-secondary">{c.generateHint}</p>
      </div>
    </Card>
  );
}
