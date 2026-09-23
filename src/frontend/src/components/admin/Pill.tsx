import type { ReactNode } from "react";
import { cn } from "@/utils/cn";

export type PillTone = "success" | "error" | "muted" | "accent" | "gold" | "purple";

/** The dot's colour per tone; the text stays in the text tokens so it clears 4.5:1 in both themes. */
const DOT: Record<PillTone, string> = {
  success: "bg-success",
  error: "bg-error",
  muted: "bg-text-muted",
  accent: "bg-accent",
  gold: "bg-gold",
  purple: "bg-purple",
};

interface PillProps {
  tone: PillTone;
  children: ReactNode;
  className?: string;
}

/**
 * A small status or kind label for the admin tables: a coloured dot and the
 * word, never colour alone. The text keeps `text-text-primary`, the dot
 * carries the meaning a glance picks up.
 */
export function Pill({ tone, children, className }: PillProps) {
  return (
    <span
      data-tone={tone}
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-border-soft bg-bg-surface px-2 py-0.5 text-xs font-medium text-text-primary",
        className
      )}
    >
      <span aria-hidden="true" className={cn("h-1.5 w-1.5 shrink-0 rounded-full", DOT[tone])} />
      {children}
    </span>
  );
}

/** A turn's status as a tone: ok is green, an error red, a cancelled turn grey. */
export function statusTone(status: "ok" | "error" | "cancelled"): PillTone {
  if (status === "ok") return "success";
  if (status === "error") return "error";
  return "muted";
}

/** A turn's kind as a tone. */
export function kindTone(kind: "planner" | "chat" | "card"): PillTone {
  if (kind === "planner") return "accent";
  if (kind === "chat") return "purple";
  return "gold";
}
