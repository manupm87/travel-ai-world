"use client";

/** Types one phrase after another, for an animated placeholder. */

import { useEffect, useState, useSyncExternalStore } from "react";

interface TypewriterOptions {
  /** Milliseconds per character while typing. */
  typeMs?: number;
  /** Milliseconds per character while deleting; a rewind is faster than typing. */
  deleteMs?: number;
  /** How long a finished phrase stays on screen. */
  holdMs?: number;
  /** The pause before the first character, so the entrance lands first. */
  startDelayMs?: number;
}

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

type Phase = "typing" | "holding" | "deleting";

interface Cursor {
  /** Index of the phrase being written. */
  phrase: number;
  /** How many of its characters are on screen. */
  length: number;
  phase: Phase;
}

const START: Cursor = { phrase: 0, length: 0, phase: "typing" };

function subscribeToMotion(onChange: () => void) {
  const query = window.matchMedia?.(REDUCED_MOTION);
  query?.addEventListener?.("change", onChange);
  return () => query?.removeEventListener?.("change", onChange);
}

const motionSnapshot = () => window.matchMedia?.(REDUCED_MOTION).matches === true;
/** Prerendering knows nothing about the reader; either way it starts empty. */
const motionServerSnapshot = () => false;

/**
 * Types one phrase after another, for the landing's placeholder (`AskField`). Under
 * `prefers-reduced-motion` the first phrase is there in full: the text is state, so the
 * `globals.css` guard does not cover it.
 * @param phrases - A stable array (i18n copy): a new array restarts the cycle.
 */
export function useTypewriter(
  phrases: readonly string[],
  options: TypewriterOptions = {}
): string {
  const { typeMs = 40, deleteMs = 18, holdMs = 2500, startDelayMs = 400 } = options;
  const reduced = useSyncExternalStore(
    subscribeToMotion,
    motionSnapshot,
    motionServerSnapshot
  );
  const [cursor, setCursor] = useState<Cursor>(START);

  // new phrases (another language) restart the cycle, during the render that brought them
  const [written, setWritten] = useState(phrases);
  if (written !== phrases) {
    setWritten(phrases);
    setCursor(START);
  }

  useEffect(() => {
    if (reduced || phrases.length === 0) return;

    const phrase = phrases[cursor.phrase] ?? "";
    const next = (): [number, Cursor] => {
      if (cursor.phase === "typing") {
        if (cursor.length < phrase.length) {
          const first = cursor.phrase === 0 && cursor.length === 0;
          return [first ? startDelayMs : typeMs, { ...cursor, length: cursor.length + 1 }];
        }
        return [holdMs, { ...cursor, phase: "holding" }];
      }
      if (cursor.phase === "holding") {
        return [deleteMs, { ...cursor, phase: "deleting" }];
      }
      if (cursor.length > 0) {
        return [deleteMs, { ...cursor, length: cursor.length - 1 }];
      }
      return [typeMs, { phrase: (cursor.phrase + 1) % phrases.length, length: 0, phase: "typing" }];
    };

    const [delay, value] = next();
    const timer = window.setTimeout(() => setCursor(value), delay);
    return () => window.clearTimeout(timer);
  }, [cursor, reduced, phrases, typeMs, deleteMs, holdMs, startDelayMs]);

  if (phrases.length === 0) return "";
  if (reduced) return phrases[0] ?? "";
  return (phrases[cursor.phrase] ?? "").slice(0, cursor.length);
}
