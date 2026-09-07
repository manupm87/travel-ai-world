"use client";

import { useCallback, useEffect, useRef } from "react";

/**
 * Grows a textarea with its content, between `minPx` and `maxPx`.
 * Re-measures whenever `value` changes; `resize()` is exposed for manual calls.
 */
export function useAutoResizeTextarea(value: string, maxPx: number) {
  const ref = useRef<HTMLTextAreaElement>(null);

  const resize = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, maxPx)}px`;
  }, [maxPx]);

  useEffect(() => {
    resize();
  }, [value, resize]);

  return { ref, resize };
}
