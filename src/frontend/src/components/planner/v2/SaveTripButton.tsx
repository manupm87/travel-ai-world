"use client";

import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { useLanguage } from "@/context/LanguageContext";
import type { SaveTripStatus } from "@/hooks/useSaveTrip";

export interface SaveTripButtonProps {
  status: SaveTripStatus;
  /** The trip the draft is saved as: what "Open trip" points at. */
  tripId: string | null;
  /** False in demo mode, signed out, or with nothing planned yet. */
  canSave: boolean;
  /** Why it cannot save although there is a trip: its dates have passed (TRA-244). */
  blocked?: "past-dates" | null;
  onSave: () => void;
}

/**
 * "Save trip" in the panel's header, and what became of the last press:
 * a spinner while the snapshot is being written, the way into the saved trip
 * once it is, or what to do about a failure. The work is `useSaveTrip`;
 * this renders its four states and nothing else.
 */
export function SaveTripButton({
  status,
  tripId,
  canSave,
  blocked = null,
  onSave,
}: SaveTripButtonProps) {
  const { t } = useLanguage();
  const p = t.plan.panel;

  const button = (
    label: string,
    { busy = false, disabled = false }: { busy?: boolean; disabled?: boolean } = {}
  ) => (
    <Button
      size="sm"
      onClick={disabled ? undefined : onSave}
      disabled={disabled}
      aria-disabled={disabled || undefined}
      aria-busy={busy || undefined}
      title={canSave ? undefined : blocked ? p.savePastDates : p.saveHint}
      className="px-4 py-2 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {busy && (
        <span
          aria-hidden="true"
          className="mr-2 inline-block h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent align-[-1px]"
        />
      )}
      {label}
    </Button>
  );

  if (blocked) {
    return (
      <span className="flex items-center gap-2">
        {button(p.save, { disabled: true })}
        <span role="status" className="text-xs text-warning">
          {p.savePastDates}
        </span>
      </span>
    );
  }
  if (!canSave) return button(p.save, { disabled: true });
  if (status === "saving") return button(p.saving, { busy: true, disabled: true });

  if (status === "saved" && tripId) {
    return (
      <p role="status" className="flex items-center gap-2 text-xs text-text-secondary">
        {p.saved}
        <Link
          href={`/trip/?id=${encodeURIComponent(tripId)}`}
          className="rounded-sm font-medium text-accent underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
        >
          {p.openTrip}
        </Link>
      </p>
    );
  }

  if (status === "error") {
    return (
      <span className="flex items-center gap-2">
        <span role="status" className="text-xs text-error">
          {p.saveError}
        </span>
        {button(p.saveRetry)}
      </span>
    );
  }

  return button(p.save);
}
