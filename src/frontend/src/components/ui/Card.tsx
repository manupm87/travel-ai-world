import React from "react";
import { cn } from "@/utils/cn";

interface CardProps {
  children: React.ReactNode;
  className?: string;
  highlight?: boolean;
  /** `solid` is the opaque surface; `glass` lets the aurora through it. */
  variant?: "solid" | "glass";
}

const VARIANTS = {
  solid: "bg-bg-card border-border",
  glass: "bg-glass-bg border-glass-border backdrop-blur-xl",
} as const;

/**
 * Generic Content Card.
 *
 * Standardizes the appearance of block-level containers with the standard
 * `bg-card` background, rounded borders, and inner padding. Optional highlight
 * styling draws emphasis to the card. `className` is merged with `cn`, so a
 * consumer's `p-8` replaces the default `p-6` deterministically.
 *
 * @param variant - `solid` (default) or the translucent `glass` surface.
 * @param highlight - If true, applies accent borders and a soft background.
 */
export function Card({
  children,
  className,
  highlight = false,
  variant = "solid",
}: CardProps) {
  return (
    <div
      data-highlight={highlight || undefined}
      className={cn(
        "rounded-2xl p-6 border",
        VARIANTS[variant],
        highlight && "border-accent-border bg-accent-soft",
        className
      )}
    >
      {children}
    </div>
  );
}
