"use client";

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
 * Types one phrase after another, the way a person would fill the field.
 *
 * It is the landing's example asks (`AskField`): a placeholder that writes
 * itself says what this field takes without a row of example chips under it.
 *
 * Under `prefers-reduced-motion` nothing moves — the first phrase is simply
 * there, in full. That is the one guard a component may not inherit from
 * `globals.css`, because the text is state, not a CSS animation.
 *
 * @param phrases - The asks to cycle through. A stable array (i18n copy), not
 *   a literal rebuilt on every render, or the cycle restarts with each one.
 * @returns What should be on screen right now.
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

  // The phrases changed (the reader switched language): start the cycle over,
  // during the render that brought them rather than in an effect after it.
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
