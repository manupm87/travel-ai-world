"use client";

/** A modal dialog's focus trap, Escape and focus return. */

import { useEffect, useRef, type RefObject } from "react";

/** Everything that can hold the focus inside a dialog. */
const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export interface UseDialogOptions {
  /** `false` keeps every listener off: a closed dialog owns nothing. */
  open: boolean;
  /**
   * Called on Escape only; the backdrop and the buttons call their own handlers. `null` refuses
   * Escape, which an action already in flight needs: closing would hide it, not call it back.
   */
  onEscape: (() => void) | null;
  /** What takes the focus on open; without it the dialog does, so it needs `tabIndex={-1}`. */
  initialFocus?: RefObject<HTMLElement | null>;
  /** Freezes the page behind a dialog tall enough to scroll on its own. */
  lockScroll?: boolean;
}

/**
 * The focus trap `aria-modal` promises, for every modal: focus moves in on open, Tab cycles
 * inside, Escape asks to close, and on close the focus returns to whatever opened the dialog.
 * @returns the ref to put on the dialog element.
 */
export function useDialog<T extends HTMLElement>({
  open,
  onEscape,
  initialFocus,
  lockScroll = false,
}: UseDialogOptions): RefObject<T | null> {
  const dialogRef = useRef<T>(null);
  const restoreRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement;
    restoreRef.current = previous instanceof HTMLElement ? previous : null;
    (initialFocus?.current ?? dialogRef.current)?.focus();
    return () => {
      restoreRef.current?.focus();
    };
    // `initialFocus` is a ref object, stable across renders
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        // a dialog opened from inside another surface must not close that one too
        event.stopPropagation();
        onEscape?.();
        return;
      }
      const dialog = dialogRef.current;
      if (event.key !== "Tab" || !dialog) return;
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE));
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;
      const active = document.activeElement;
      const outside = !dialog.contains(active);
      if (event.shiftKey && (active === first || outside)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || outside)) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onEscape]);

  useEffect(() => {
    if (!open || !lockScroll) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open, lockScroll]);

  return dialogRef;
}
