"use client";

import { useCallback, useLayoutEffect, useRef } from "react";

/** Distance from the bottom (px) within which the list keeps following. */
const DEFAULT_THRESHOLD_PX = 24;

interface Options {
  /** Change this value to force following again (e.g. on every new send). */
  pinKey?: unknown;
  threshold?: number;
}

/**
 * Keeps a scrollable element pinned to its bottom while its content grows,
 * unless the user has scrolled up to read something.
 *
 * Only the element scrolls: `scrollIntoView` would also scroll the page and
 * fight the user's own scroll.
 *
 * @param dependency - re-evaluate whenever this changes (e.g. the messages array).
 */
export function useStickToBottom<T extends HTMLElement>(
  dependency: unknown,
  { pinKey, threshold = DEFAULT_THRESHOLD_PX }: Options = {}
) {
  const ref = useRef<T>(null);
  /** True while the user is at (or near) the bottom: follow the content. */
  const stickRef = useRef(true);
  const lastPinKeyRef = useRef(pinKey);

  useLayoutEffect(() => {
    if (pinKey !== lastPinKeyRef.current) {
      lastPinKeyRef.current = pinKey;
      stickRef.current = true;
    }
    const el = ref.current;
    if (!el || !stickRef.current) return;
    el.scrollTop = el.scrollHeight;
  }, [dependency, pinKey]);

  const onScroll = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    stickRef.current = distance <= threshold;
  }, [threshold]);

  return { ref, onScroll };
}
