import React from "react";
import { Container } from "./Container";

interface SectionProps {
  children: React.ReactNode;
  variant?: "primary" | "secondary" | "transparent";
  padding?: "none" | "small" | "medium" | "large" | "xlarge";
  id?: string;
}

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
  id 
}: SectionProps) {
  const bgClasses = {
    primary: "bg-bg-primary",
    secondary: "bg-bg-secondary",
    transparent: "bg-transparent"
  };

  const paddingClasses = {
    none: "py-0",
    small: "py-6",
    medium: "py-10",
    large: "py-[60px]",
    xlarge: "py-20"
  };

  return (
    <section 
      id={id}
      className={`w-full ${bgClasses[variant]} ${paddingClasses[padding]}`}
    >
      <Container className="flex flex-col">
        {children}
      </Container>
    </section>
  );
}
