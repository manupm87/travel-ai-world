"use client";

import { useId, useRef } from "react";
import { Plus, X } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { useDialog } from "@/hooks/useDialog";
import { TripsList } from "./TripsList";

export interface TripsSheetProps {
  open: boolean;
  onClose: () => void;
  /** The trip the planner has open, so its card says where you already are. */
  openTripId?: string | null;
  /** After a trip is deleted; the planner empties itself if it held that one. */
  onDeleted?: (id: string) => void;
  /** "New trip": an empty planner, and the sheet out of the way. */
  onNewTrip: () => void;
}

/**
 * The account's trips over the planner, without leaving it.
 *
 * The planner is a workspace with three panes and no room for a fourth, so
 * the list arrives as a sheet on the same glass every other dialog uses —
 * never an opaque card over the aurora — and slides in from the right on a
 * desktop, which is where the trip pane it belongs to is. It keeps the one
 * dialog contract (`hooks/useDialog.ts`): the close button takes the focus,
 * Tab stays inside, Escape closes, and the focus goes back to the button
 * that opened it. The page behind it is frozen while it is open, because it
 * scrolls on its own.
 */
export function TripsSheet({
  open,
  onClose,
  openTripId = null,
  onDeleted,
  onNewTrip,
}: TripsSheetProps) {
  const { t } = useLanguage();
  const l = t.plan.trips;
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);

  const dialogRef = useDialog<HTMLDivElement>({
    open,
    onEscape: onClose,
    initialFocus: closeRef,
    lockScroll: true,
  });

  if (!open) return null;

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
        tabIndex={-1}
        className="fixed inset-y-0 right-0 z-50 flex w-[min(26rem,100vw)] animate-slide-in-right flex-col border-l border-glass-border bg-glass-bg backdrop-blur-xl"
      >
        <header className="flex items-center gap-3 border-b border-glass-border px-5 py-4">
          <h2 id={titleId} className="flex-1 text-lg font-medium text-text-primary">
            {l.title}
          </h2>
          <button
            type="button"
            onClick={onNewTrip}
            className="inline-flex items-center gap-1.5 rounded-lg border border-glass-border px-3 py-2 text-sm font-medium text-text-primary transition hover:border-accent-border focus-visible:ring-2 focus-visible:ring-accent/50 focus-visible:outline-none"
          >
            <Plus size={15} aria-hidden="true" />
            {l.newTrip}
          </button>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label={l.close}
            className="flex h-9 w-9 items-center justify-center rounded-full text-text-secondary transition hover:text-text-primary focus-visible:ring-2 focus-visible:ring-accent/50 focus-visible:outline-none"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto overscroll-y-contain p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
          <TripsList openTripId={openTripId} onDeleted={onDeleted} onOpen={onClose} />
        </div>
      </div>
    </>
  );
}
