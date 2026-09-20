"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { useDialog } from "@/hooks/useDialog";
import { interpolate } from "@/i18n";
import type { TripSummary } from "@/types/trip-summary";

export interface ConfirmDeleteProps {
  /** The trip about to go; `null` keeps the dialog closed. */
  trip: TripSummary | null;
  /** Rejects when the API refuses: the dialog stays open and says so. */
  onConfirm: () => Promise<void>;
  onCancel: () => void;
}

/**
 * The one question before a trip is gone for good.
 *
 * Small, centred, and deliberately unbalanced: Cancel holds the focus when the
 * dialog opens, so Enter never deletes anything by momentum. The destructive
 * button keeps the name it had in the menu — "Delete trip" — so the action
 * reads the same from the card to the confirmation.
 *
 * Once "Delete trip" is pressed the dialog locks: Cancel, Escape and the
 * backdrop all stop answering, because the request is already on its way and
 * closing the dialog would not call it back — it would only hide the fact.
 */
export function ConfirmDelete({ trip, onConfirm, onCancel }: ConfirmDeleteProps) {
  const { t } = useLanguage();
  const r = t.dashboard.remove;
  const titleId = useId();
  const descriptionId = useId();

  const [deleting, setDeleting] = useState(false);
  const [failed, setFailed] = useState(false);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const known = useRef(trip);
  const open = trip !== null;

  // The shared dialog contract (`hooks/useDialog.ts`). Once the DELETE is in
  // flight there is nothing left to call off, so Escape stops answering: the
  // dialog refuses to disappear and pretend the trip survived.
  const dialogRef = useDialog<HTMLDivElement>({
    open,
    onEscape: deleting ? null : onCancel,
    initialFocus: cancelRef,
  });

  // Another trip starts the question over; a re-render of the same one does
  // not, or a failure would clear itself while it is being read.
  useEffect(() => {
    if (known.current === trip) return;
    known.current = trip;
    setDeleting(false);
    setFailed(false);
  }, [trip]);

  // Both buttons go disabled while the DELETE is in flight, which would drop
  // focus onto the body and out of the trap; the dialog itself holds it.
  useEffect(() => {
    if (!deleting) return;
    dialogRef.current?.focus();
  }, [deleting, dialogRef]);

  if (!trip) return null;

  const confirm = async () => {
    setDeleting(true);
    setFailed(false);
    try {
      await onConfirm();
    } catch {
      setFailed(true);
      setDeleting(false);
    }
  };

  return (
    <>
      <div
        aria-hidden="true"
        onClick={deleting ? undefined : onCancel}
        className="fixed inset-0 z-40 animate-fade-in bg-bg-primary/60 backdrop-blur-sm"
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        tabIndex={-1}
        className="fixed top-1/2 left-1/2 z-50 w-[min(24rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 animate-scale-in rounded-2xl border border-glass-border bg-bg-card p-6 shadow-field-glow"
      >
        <h2 id={titleId} className="text-lg font-medium text-text-primary">
          {r.title}
        </h2>
        <p id={descriptionId} className="mt-2 text-sm leading-relaxed text-text-secondary">
          {interpolate(r.description, { title: trip.title })}
        </p>

        {failed && (
          <p role="alert" className="mt-3 text-sm text-error">
            {r.failed}
          </p>
        )}

        <div className="mt-6 flex items-center justify-end gap-2">
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            disabled={deleting}
            className="rounded-lg px-4 py-2.5 text-sm font-medium text-text-secondary transition hover:text-text-primary focus-visible:ring-2 focus-visible:ring-accent/50 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60"
          >
            {r.cancel}
          </button>
          <button
            type="button"
            onClick={confirm}
            disabled={deleting}
            /* `text-bg-primary` rather than white: the error red is light on
               the dark theme and dark on the light one, so the label has to
               flip with it to stay at 4.5:1. */
            className="inline-flex items-center gap-2 rounded-lg bg-error px-4 py-2.5 text-sm font-medium text-bg-primary transition hover:opacity-90 focus-visible:ring-2 focus-visible:ring-error/50 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60"
          >
            {deleting && <Loader2 size={15} className="animate-spin" aria-hidden="true" />}
            {deleting ? r.deleting : r.confirm}
          </button>
        </div>
      </div>
    </>
  );
}
