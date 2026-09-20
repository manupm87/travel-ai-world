"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { Loader2 } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { useDialog } from "@/hooks/useDialog";
import type { TripSummary } from "@/types/trip-summary";

export interface RenameTripDialogProps {
  /** The trip being renamed; `null` keeps the dialog closed. */
  trip: TripSummary | null;
  /** Rejects when the API refuses: the dialog stays open and says so. */
  onSave: (title: string) => Promise<void>;
  onClose: () => void;
}

/**
 * One field, because a trip has one thing worth changing by hand.
 *
 * Everything else about a saved trip — where it goes, when, what is planned
 * in it — belongs to the planner and changes by planning; the title is the
 * name it goes under in the list, and this is where it is typed. The same
 * dialog contract as every other modal (`hooks/useDialog.ts`), with the field
 * focused on open and Escape closing it, unless the write is already away.
 */
export function RenameTripDialog({ trip, onSave, onClose }: RenameTripDialogProps) {
  const { t } = useLanguage();
  const r = t.plan.trips.rename;
  const titleId = useId();
  const fieldId = useId();
  const errorId = useId();

  const [title, setTitle] = useState(trip?.title ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fieldRef = useRef<HTMLInputElement>(null);
  const known = useRef(trip);
  const open = trip !== null;

  const dialogRef = useDialog<HTMLDivElement>({
    open,
    onEscape: saving ? null : onClose,
    initialFocus: fieldRef,
  });

  // Another trip starts the field over; a re-render of the same one does not,
  // or what is being typed would be thrown away.
  useEffect(() => {
    if (known.current === trip) return;
    known.current = trip;
    setTitle(trip?.title ?? "");
    setSaving(false);
    setError(null);
  }, [trip]);

  if (!trip) return null;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const next = title.trim();
    if (!next) {
      setError(r.required);
      fieldRef.current?.focus();
      return;
    }
    if (next === trip.title) {
      onClose();
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave(next);
      onClose();
    } catch {
      setError(r.failed);
      setSaving(false);
    }
  };

  return (
    <>
      <div
        aria-hidden="true"
        onClick={saving ? undefined : onClose}
        className="fixed inset-0 z-40 animate-fade-in bg-bg-primary/60 backdrop-blur-sm"
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="fixed top-1/2 left-1/2 z-50 w-[min(26rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 animate-scale-in rounded-2xl border border-glass-border bg-glass-bg p-6 shadow-field-glow backdrop-blur-xl"
      >
        <h2 id={titleId} className="text-lg font-medium text-text-primary">
          {r.title}
        </h2>

        <form onSubmit={submit} className="mt-4 flex flex-col gap-2">
          <label htmlFor={fieldId} className="text-sm text-text-secondary">
            {r.label}
          </label>
          <input
            ref={fieldRef}
            id={fieldId}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            disabled={saving}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errorId : undefined}
            className="rounded-lg border border-glass-border bg-bg-card px-3 py-2.5 text-[15px] text-text-primary transition focus:border-accent-border focus-visible:ring-2 focus-visible:ring-accent/50 focus-visible:outline-none disabled:opacity-60"
          />

          {error && (
            <p id={errorId} role="alert" className="text-sm text-error">
              {error}
            </p>
          )}

          <div className="mt-4 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="rounded-lg px-4 py-2.5 text-sm font-medium text-text-secondary transition hover:text-text-primary focus-visible:ring-2 focus-visible:ring-accent/50 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60"
            >
              {r.cancel}
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-bg-primary transition hover:opacity-90 focus-visible:ring-2 focus-visible:ring-accent/50 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving && <Loader2 size={15} className="animate-spin" aria-hidden="true" />}
              {saving ? r.saving : r.save}
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
