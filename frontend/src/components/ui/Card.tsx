import React from "react";

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
 * styling draws emphasis to the card.
 * 
 * @param highlight - If true, applies accent borders and a soft background.
 */
export function Card({ children, className = "", highlight = false }: CardProps) {
  return (
    <div className={`bg-bg-card rounded-2xl p-6 border ${
      highlight ? "border-accent-border bg-accent-soft" : "border-border"
    } ${className}`}>
      {children}
    </div>
  );
}
