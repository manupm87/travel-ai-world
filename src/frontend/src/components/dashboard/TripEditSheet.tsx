"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { Loader2, X } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { useDialog } from "@/hooks/useDialog";
import type { TripUpdate } from "@/services/trips";
import { TRIP_STATUSES, type TripStatus, type TripSummary } from "@/types/trip-summary";
import { daysBetween } from "@/utils/tripDates";

export interface TripEditSheetProps {
  /** The trip being changed; `null` keeps the sheet closed. */
  trip: TripSummary | null;
  /** Rejects when the API refuses: the sheet stays open and says so. */
  onSave: (patch: TripUpdate) => Promise<void>;
  onClose: () => void;
}

/** What the form holds while it is being typed into. */
interface Draft {
  title: string;
  description: string;
  startDate: string;
  endDate: string;
  status: TripStatus;
}

const draftOf = (trip: TripSummary): Draft => ({
  title: trip.title,
  description: trip.description,
  startDate: trip.startDate,
  endDate: trip.endDate,
  status: trip.status,
});

// `color-scheme` is declared once on the root (globals.css), which is what
// makes the date picker and the select draw themselves in the theme the page
// is wearing instead of the browser's default light chrome (TRA-192 caveat).
const FIELD =
  "w-full rounded-xl border border-glass-border bg-glass-bg px-3 py-2.5 text-[15px] text-text-primary placeholder:text-text-secondary transition-colors focus-visible:border-accent-border focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:outline-none";
const LABEL = "text-sm text-text-secondary";

/**
 * Changing a trip without leaving the dashboard: a sheet that slides in from
 * the right on a desktop and up from the bottom on a phone.
 *
 * It is a real modal — `aria-modal`, Tab cycles inside it, Escape closes it
 * and the ⋯ button that opened it takes the focus back — and it only sends
 * the fields that actually changed, so a trip's itinerary is never touched by
 * a rename. Moving the dates moves `duration_days` with them; leaving them
 * inconsistent is what makes the viewer say "Your 14-day journey" over four
 * days.
 */
export function TripEditSheet({ trip, onSave, onClose }: TripEditSheetProps) {
  const { t } = useLanguage();
  const e = t.dashboard.edit;
  const titleId = useId();
  const ids = { title: useId(), description: useId(), start: useId(), end: useId(), status: useId() };

  // Filled on the first render, not in an effect: the fields have to exist
  // before the focus effect below looks for the first one.
  const [draft, setDraft] = useState<Draft | null>(() => (trip ? draftOf(trip) : null));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const firstRef = useRef<HTMLInputElement>(null);
  const known = useRef(trip);
  const open = trip !== null;

  // The dialog contract — focus in, Tab trapped, Escape, focus returned — is
  // the shared one (`hooks/useDialog.ts`), so the sheet, the delete
  // confirmation and the sign-in dialog all answer the keyboard alike.
  const dialogRef = useDialog<HTMLDivElement>({
    open,
    onEscape: onClose,
    initialFocus: firstRef,
    lockScroll: true,
  });

  // Another trip resets the form, so reopening never shows what was typed
  // into another card.
  useEffect(() => {
    if (known.current === trip) return;
    known.current = trip;
    setDraft(trip ? draftOf(trip) : null);
    setError(null);
    setSaving(false);
  }, [trip]);

  if (!trip || !draft) return null;

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setDraft((current) => (current ? { ...current, [key]: value } : current));
    setError(null);
  };

  const invalidTitle = error === e.nameRequired;
  const invalidDates = error === e.datesOrder;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const title = draft.title.trim();
    if (!title) {
      setError(e.nameRequired);
      firstRef.current?.focus();
      return;
    }
    if (draft.startDate && draft.endDate && draft.endDate < draft.startDate) {
      setError(e.datesOrder);
      return;
    }

    // Only what changed: a patch that repeats the trip back at core_api would
    // rewrite fields nobody touched.
    const patch: TripUpdate = {};
    if (title !== trip.title) patch.title = title;
    if (draft.description !== trip.description) patch.description = draft.description;
    if (draft.startDate !== trip.startDate) patch.start_date = draft.startDate || null;
    if (draft.endDate !== trip.endDate) patch.end_date = draft.endDate || null;
    if (draft.status !== trip.status) patch.status = draft.status;
    if (patch.start_date !== undefined || patch.end_date !== undefined) {
      patch.duration_days = daysBetween(draft.startDate || null, draft.endDate || null);
    }
    if (Object.keys(patch).length === 0) {
      onClose();
      return;
    }

    setSaving(true);
    try {
      await onSave(patch);
      onClose();
    } catch {
      setError(e.failed);
      setSaving(false);
    }
  };

  return (
    <>
      <div
        aria-hidden="true"
        onClick={onClose}
        className="fixed inset-0 z-40 animate-fade-in bg-bg-primary/60 backdrop-blur-sm"
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="fixed inset-x-0 bottom-0 z-50 flex max-h-[90dvh] animate-slide-in-up flex-col overflow-y-auto rounded-t-2xl border border-glass-border bg-bg-card sm:inset-y-0 sm:left-auto sm:max-h-none sm:w-[26rem] sm:animate-slide-in-right sm:rounded-none sm:rounded-l-2xl"
      >
        <div className="flex items-start gap-3 border-b border-border px-5 py-4">
          <h2 id={titleId} className="flex-1 text-lg font-medium text-text-primary">
            {e.title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={e.close}
            className="shrink-0 rounded-lg p-1.5 text-text-secondary transition hover:text-text-primary focus-visible:ring-2 focus-visible:ring-accent/50 focus-visible:outline-none"
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>

        <form onSubmit={submit} className="flex flex-1 flex-col gap-4 px-5 py-5">
          <div className="flex flex-col gap-1.5">
            <label htmlFor={ids.title} className={LABEL}>
              {e.name}
            </label>
            <input
              ref={firstRef}
              id={ids.title}
              type="text"
              value={draft.title}
              onChange={(event) => set("title", event.target.value)}
              aria-invalid={invalidTitle}
              className={FIELD}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor={ids.description} className={LABEL}>
              {e.description}
            </label>
            <textarea
              id={ids.description}
              rows={3}
              value={draft.description}
              onChange={(event) => set("description", event.target.value)}
              className={`${FIELD} resize-none`}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label htmlFor={ids.start} className={LABEL}>
                {e.startDate}
              </label>
              <input
                id={ids.start}
                type="date"
                value={draft.startDate}
                onChange={(event) => set("startDate", event.target.value)}
                aria-invalid={invalidDates}
                className={FIELD}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor={ids.end} className={LABEL}>
                {e.endDate}
              </label>
              <input
                id={ids.end}
                type="date"
                value={draft.endDate}
                onChange={(event) => set("endDate", event.target.value)}
                aria-invalid={invalidDates}
                className={FIELD}
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor={ids.status} className={LABEL}>
              {e.status}
            </label>
            <select
              id={ids.status}
              value={draft.status}
              onChange={(event) => set("status", event.target.value as TripStatus)}
              className={FIELD}
            >
              {TRIP_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {t.status[status]}
                </option>
              ))}
            </select>
          </div>

          {error && (
            <p role="alert" className="text-sm text-error">
              {error}
            </p>
          )}

          <div className="mt-auto flex items-center justify-end gap-2 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-4 py-2.5 text-sm font-medium text-text-secondary transition hover:text-text-primary focus-visible:ring-2 focus-visible:ring-accent/50 focus-visible:outline-none"
            >
              {e.cancel}
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-white transition hover:bg-accent-hover focus-visible:ring-2 focus-visible:ring-accent/50 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving && <Loader2 size={15} className="animate-spin" aria-hidden="true" />}
              {saving ? e.saving : e.save}
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
