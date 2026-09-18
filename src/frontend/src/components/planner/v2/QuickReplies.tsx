"use client";

import { useId, useState } from "react";
import { Minus, Plus } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { interpolate } from "@/i18n";
import type { BriefField, PriceTier, TripBrief } from "@/types/planner";
import { cn } from "@/utils/cn";

export interface QuickRepliesProps {
  brief: TripBrief;
  /** Checklist fields the brief still lacks; one widget each, in this order. */
  missing: BriefField[];
  /** A turn is streaming, or there is no backend. */
  disabled?: boolean;
  /** The answered fields, plus the message that says them out loud. */
  onAnswer: (patch: Partial<TripBrief>, text: string) => void;
}

/** The order the widgets are shown in, whatever order `missing` arrives in. */
const FIELD_ORDER: BriefField[] = [
  "destination",
  "origin",
  "dates",
  "travellers",
  "interests",
];

const TIERS: PriceTier[] = [1, 2, 3];

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Whole days between two ISO dates; `null` when either is missing or malformed. */
function nightsBetween(from: string, to: string): number | null {
  const start = Date.parse(`${from}T00:00:00Z`);
  const end = Date.parse(`${to}T00:00:00Z`);
  if (Number.isNaN(start) || Number.isNaN(end)) return null;
  return Math.round((end - start) / MS_PER_DAY);
}

const fieldClass =
  "w-full rounded-lg border border-border-soft bg-bg-primary px-3 py-2 text-sm text-text-primary placeholder-text-secondary/50 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40";

const labelClass = "text-[11px] font-medium uppercase tracking-[0.12em] text-text-secondary";

const stepperButtonClass =
  "flex h-7 w-7 items-center justify-center rounded-lg border border-border-soft text-text-primary transition hover:border-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 disabled:cursor-not-allowed disabled:opacity-40";

/**
 * The structured half of the conversation: instead of asking the user to type
 * "two adults, 23 to 27 October", the missing brief fields become inputs,
 * steppers and chips. Confirm sends both the patch (so the checklist updates
 * at once) and the sentence the assistant sees.
 *
 * Renders nothing when there is nothing left to ask.
 */
export function QuickReplies({ brief, missing, disabled = false, onAnswer }: QuickRepliesProps) {
  const { t } = useLanguage();
  const q = t.plan.quickReplies;
  const ids = useId();

  const [destination, setDestination] = useState(brief.destination ?? "");
  const [origin, setOrigin] = useState(brief.origin ?? "");
  const [startDate, setStartDate] = useState(brief.start_date ?? "");
  const [endDate, setEndDate] = useState(brief.end_date ?? "");
  const [adults, setAdults] = useState(brief.adults ?? 2);
  const [children, setChildren] = useState(brief.children ?? 0);
  const [interests, setInterests] = useState<string[]>(brief.interests);
  const [budget, setBudget] = useState<PriceTier | null>(brief.budget_tier);

  const fields = FIELD_ORDER.filter((field) => missing.includes(field));
  const showBudget = brief.budget_tier === null;

  if (fields.length === 0 && !showBudget) return null;

  const shows = (field: BriefField) => fields.includes(field);

  const nights =
    startDate && endDate ? nightsBetween(startDate, endDate) : null;
  const datesReady = nights !== null && nights >= 0;

  const ready =
    // Nothing to answer (only the optional budget shown and none picked): no turn.
    (fields.length > 0 || budget !== null) &&
    (!shows("destination") || destination.trim().length > 0) &&
    (!shows("origin") || origin.trim().length > 0) &&
    (!shows("dates") || datesReady) &&
    (!shows("travellers") || adults >= 1) &&
    (!shows("interests") || interests.length > 0);

  const toggleInterest = (id: string) =>
    setInterests((current) =>
      current.includes(id) ? current.filter((i) => i !== id) : [...current, id]
    );

  const confirm = () => {
    if (!ready || disabled) return;
    const patch: Partial<TripBrief> = {};
    const parts: string[] = [];

    if (shows("destination")) {
      const value = destination.trim();
      patch.destination = value;
      parts.push(interpolate(q.summary.destination, { value }));
    }
    if (shows("origin")) {
      const value = origin.trim();
      patch.origin = value;
      parts.push(interpolate(q.summary.origin, { value }));
    }
    if (shows("dates")) {
      patch.start_date = startDate;
      patch.end_date = endDate;
      patch.nights = nights;
      parts.push(interpolate(q.summary.dates, { from: startDate, to: endDate }));
    }
    if (shows("travellers")) {
      patch.adults = adults;
      patch.children = children;
      parts.push(interpolate(q.summary.travellers, { adults, children }));
    }
    if (shows("interests")) {
      patch.interests = interests;
      const labels = q.interestOptions
        .filter((option) => interests.includes(option.id))
        .map((option) => option.label);
      parts.push(interpolate(q.summary.interests, { value: labels.join(", ") }));
    }
    if (showBudget && budget !== null) {
      patch.budget_tier = budget;
      parts.push(
        interpolate(q.summary.budget, {
          value: t.plan.priceTierNames[String(budget) as "1" | "2" | "3"],
        })
      );
    }

    if (parts.length === 0) return;
    onAnswer(patch, parts.join(" · "));
  };

  const stepper = (
    label: string,
    value: number,
    min: number,
    set: (next: number) => void
  ) => (
    <div role="group" aria-label={label} className="flex items-center justify-between gap-3">
      <span className="text-sm text-text-primary">{label}</span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => set(Math.max(min, value - 1))}
          disabled={disabled || value <= min}
          aria-label={q.decrease}
          className={stepperButtonClass}
        >
          <Minus size={14} aria-hidden="true" />
        </button>
        <span aria-live="polite" className="w-6 text-center text-sm tabular-nums text-text-primary">
          {value}
        </span>
        <button
          type="button"
          onClick={() => set(value + 1)}
          disabled={disabled}
          aria-label={q.increase}
          className={stepperButtonClass}
        >
          <Plus size={14} aria-hidden="true" />
        </button>
      </div>
    </div>
  );

  return (
    <section
      aria-label={q.title}
      className="flex flex-col gap-4 rounded-2xl border border-border bg-bg-card p-4"
    >
      <h3 className="text-sm font-medium text-text-primary">{q.title}</h3>

      {shows("destination") && (
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${ids}-destination`} className={labelClass}>
            {q.destination}
          </label>
          <input
            id={`${ids}-destination`}
            type="text"
            value={destination}
            onChange={(e) => setDestination(e.target.value)}
            placeholder={q.destinationPlaceholder}
            disabled={disabled}
            className={fieldClass}
          />
        </div>
      )}

      {shows("origin") && (
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${ids}-origin`} className={labelClass}>
            {q.origin}
          </label>
          <input
            id={`${ids}-origin`}
            type="text"
            value={origin}
            onChange={(e) => setOrigin(e.target.value)}
            placeholder={q.originPlaceholder}
            disabled={disabled}
            className={fieldClass}
          />
        </div>
      )}

      {shows("dates") && (
        <div className="flex flex-col gap-1.5">
          <span className={labelClass}>{q.dates}</span>
          <div className="flex flex-wrap gap-2">
            <div className="flex min-w-[9rem] flex-1 flex-col gap-1">
              <label htmlFor={`${ids}-from`} className="text-xs text-text-secondary">
                {q.from}
              </label>
              <input
                id={`${ids}-from`}
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                disabled={disabled}
                className={fieldClass}
              />
            </div>
            <div className="flex min-w-[9rem] flex-1 flex-col gap-1">
              <label htmlFor={`${ids}-to`} className="text-xs text-text-secondary">
                {q.to}
              </label>
              <input
                id={`${ids}-to`}
                type="date"
                value={endDate}
                min={startDate || undefined}
                onChange={(e) => setEndDate(e.target.value)}
                disabled={disabled}
                className={fieldClass}
              />
            </div>
          </div>
        </div>
      )}

      {shows("travellers") && (
        <div className="flex flex-col gap-2">
          <span className={labelClass}>{q.travellers}</span>
          {stepper(q.adults, adults, 1, setAdults)}
          {stepper(q.children, children, 0, setChildren)}
        </div>
      )}

      {shows("interests") && (
        <div className="flex flex-col gap-2">
          <span className={labelClass}>{q.interests}</span>
          <div className="flex flex-wrap gap-2">
            {q.interestOptions.map((option) => {
              const checked = interests.includes(option.id);
              return (
                <button
                  key={option.id}
                  type="button"
                  role="checkbox"
                  aria-checked={checked}
                  disabled={disabled}
                  onClick={() => toggleInterest(option.id)}
                  className={cn(
                    "rounded-full border px-3 py-1.5 text-[13px] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 disabled:cursor-not-allowed disabled:opacity-50",
                    checked
                      ? "border-accent bg-accent/15 text-text-primary"
                      : "border-border-soft text-text-secondary hover:border-accent/40 hover:text-text-primary"
                  )}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {showBudget && (
        <div className="flex flex-col gap-2">
          <span className={labelClass}>{q.budget}</span>
          <div role="radiogroup" aria-label={q.budget} className="flex flex-wrap gap-2">
            {TIERS.map((tier) => {
              const key = String(tier) as "1" | "2" | "3";
              const checked = budget === tier;
              return (
                <button
                  key={tier}
                  type="button"
                  role="radio"
                  aria-checked={checked}
                  disabled={disabled}
                  onClick={() => setBudget(tier)}
                  className={cn(
                    "flex-1 rounded-lg border px-3 py-2 text-[13px] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 disabled:cursor-not-allowed disabled:opacity-50",
                    checked
                      ? "border-accent bg-accent/15 text-text-primary"
                      : "border-border-soft text-text-secondary hover:border-accent/40 hover:text-text-primary"
                  )}
                >
                  {`${t.plan.priceTiers[key]} ${t.plan.priceTierNames[key]}`}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={confirm}
        disabled={disabled || !ready}
        className="self-end rounded-lg bg-accent px-4 py-2 text-[13px] font-medium text-white transition hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {q.confirm}
      </button>
    </section>
  );
}
