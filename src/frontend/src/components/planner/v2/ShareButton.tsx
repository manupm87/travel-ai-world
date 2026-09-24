"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Share2 } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { cn } from "@/utils/cn";

/** How long the button says "Link copied" before it says "Share" again. */
const COPIED_MS = 2000;

/**
 * "Share" (TRA-238): copies the saved trip's link, `/plan/?trip=<id>`, and
 * says so for a moment. The link opens the trip for whoever it belongs to —
 * on another device, in another browser; core_api still answers someone
 * else's id as a missing one. Without a clipboard the button does nothing.
 */
export function ShareButton({ tripId, className }: { tripId: string; className?: string }) {
  const { t } = useLanguage();
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    []
  );

  const share = async () => {
    const link = `${window.location.origin}/plan/?trip=${encodeURIComponent(tripId)}`;
    try {
      await navigator.clipboard.writeText(link);
    } catch {
      return;
    }
    setCopied(true);
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setCopied(false), COPIED_MS);
  };

  return (
    <button
      type="button"
      onClick={share}
      className={cn(
        "inline-flex h-9 items-center gap-1.5 rounded-full border border-glass-border bg-glass-bg px-3.5 text-xs font-medium text-text-primary transition-colors hover:border-accent-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40",
        className
      )}
    >
      {copied ? (
        <Check size={14} aria-hidden="true" className="text-accent" />
      ) : (
        <Share2 size={14} aria-hidden="true" />
      )}
      <span aria-live="polite">{copied ? t.plan.shareCopied : t.plan.share}</span>
    </button>
  );
}
