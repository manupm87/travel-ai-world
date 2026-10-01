"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { useDialog } from "@/hooks/useDialog";
import { interpolate } from "@/i18n";

export interface ConfirmRemoveAccessProps {
  /** The email about to lose access; `null` keeps the dialog closed. */
  email: string | null;
  /** Rejects when the API refuses: the dialog stays open and says so. */
  onConfirm: () => Promise<void>;
  onCancel: () => void;
}

/**
 * The one question before an email is taken off the access list (TRA-257).
 * The same contract as the trips' `ConfirmDelete`: Cancel holds the focus
 * when it opens, and once the DELETE is on its way neither Escape nor the
 * backdrop closes it.
 */
export function ConfirmRemoveAccess({ email, onConfirm, onCancel }: ConfirmRemoveAccessProps) {
  const { t } = useLanguage();
  const copy = t.admin.access.confirm;
  const titleId = useId();
  const descriptionId = useId();

  const [removing, setRemoving] = useState(false);
  const [failed, setFailed] = useState(false);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const known = useRef(email);

  const dialogRef = useDialog<HTMLDivElement>({
    open: email !== null,
    onEscape: removing ? null : onCancel,
    initialFocus: cancelRef,
  });

  // Another email starts the question over; a re-render of the same one does not.
  useEffect(() => {
    if (known.current === email) return;
    known.current = email;
    setRemoving(false);
    setFailed(false);
  }, [email]);

  // Both buttons go disabled while the DELETE is in flight; the dialog holds the focus.
  useEffect(() => {
    if (!removing) return;
    dialogRef.current?.focus();
  }, [removing, dialogRef]);

  if (email === null) return null;

  const confirm = async () => {
    setRemoving(true);
    setFailed(false);
    try {
      await onConfirm();
    } catch {
      setFailed(true);
      setRemoving(false);
    }
  };

  return (
    <>
      <div
        aria-hidden="true"
        onClick={removing ? undefined : onCancel}
        className="fixed inset-0 z-40 animate-fade-in bg-bg-primary/60 backdrop-blur-sm"
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        tabIndex={-1}
        className="fixed top-1/2 left-1/2 z-50 w-[min(24rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 animate-scale-in rounded-2xl border border-glass-border bg-glass-bg p-6 shadow-field-glow backdrop-blur-xl"
      >
        <h2 id={titleId} className="text-lg font-medium text-text-primary">
          {copy.title}
        </h2>
        <p id={descriptionId} className="mt-2 break-words text-sm leading-relaxed text-text-secondary">
          {interpolate(copy.description, { email })}
        </p>

        {failed && (
          <p role="alert" className="mt-3 text-sm text-error">
            {copy.failed}
          </p>
        )}

        <div className="mt-6 flex items-center justify-end gap-2">
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            disabled={removing}
            className="rounded-lg px-4 py-2.5 text-sm font-medium text-text-secondary transition hover:text-text-primary focus-visible:ring-2 focus-visible:ring-accent/50 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60"
          >
            {copy.cancel}
          </button>
          <button
            type="button"
            onClick={confirm}
            disabled={removing}
            className="inline-flex items-center gap-2 rounded-lg bg-error px-4 py-2.5 text-sm font-medium text-bg-primary transition hover:opacity-90 focus-visible:ring-2 focus-visible:ring-error/50 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60"
          >
            {removing && <Loader2 size={15} className="animate-spin" aria-hidden="true" />}
            {removing ? copy.removing : copy.confirm}
          </button>
        </div>
      </div>
    </>
  );
}
