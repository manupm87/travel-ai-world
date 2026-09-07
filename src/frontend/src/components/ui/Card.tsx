import React from "react";
import { cn } from "@/utils/cn";

interface CardProps {
  children: React.ReactNode;
  className?: string;
  highlight?: boolean;
}

/**
 * Generic Content Card.
 *
 * Standardizes the appearance of block-level containers with the standard
 * `bg-card` background, rounded borders, and inner padding. Optional highlight
 * styling draws emphasis to the card. `className` is merged with `cn`, so a
 * consumer's `p-8` replaces the default `p-6` deterministically.
 *
 * @param highlight - If true, applies accent borders and a soft background.
 */
export function Card({ children, className, highlight = false }: CardProps) {
  return (
    <div
      data-highlight={highlight || undefined}
      className={cn(
        "bg-bg-card rounded-2xl p-6 border",
        highlight ? "border-accent-border bg-accent-soft" : "border-border",
        className
      )}
    >
      {children}
    </div>
  );
}
