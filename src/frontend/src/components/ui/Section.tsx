import React from "react";
import { Container } from "./Container";
import { cn } from "@/utils/cn";

interface SectionProps {
  children: React.ReactNode;
  variant?: "primary" | "secondary" | "transparent";
  padding?: "none" | "small" | "medium" | "large" | "xlarge";
  id?: string;
  className?: string;
}

const BG = {
  primary: "bg-bg-primary",
  secondary: "bg-bg-secondary",
  transparent: "bg-transparent",
} as const;

const PADDING = {
  none: "py-0",
  small: "py-6",
  medium: "py-10",
  large: "py-[60px]",
  xlarge: "py-20",
} as const;

/**
 * Standardized Section Component.
 *
 * Enforces consistent background colors, vertical padding, and grid alignment
 * using the internal `Container`.
 *
 * @param variant - Background style ("primary", "secondary", "transparent").
 * @param padding - Vertical padding amount.
 */
export function Section({
  children,
  variant = "transparent",
  padding = "medium",
  id,
  className,
}: SectionProps) {
  return (
    <section id={id} className={cn("w-full", BG[variant], PADDING[padding], className)}>
      <Container className="flex flex-col">{children}</Container>
    </section>
  );
}
