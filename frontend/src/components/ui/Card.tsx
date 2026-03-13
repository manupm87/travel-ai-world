import React from "react";

interface CardProps {
  children: React.ReactNode;
  className?: string;
  highlight?: boolean;
}

export function Card({ children, className = "", highlight = false }: CardProps) {
  return (
    <div className={`bg-bg-card rounded-2xl p-6 border ${
      highlight ? "border-accent-border bg-accent-soft" : "border-border"
    } ${className}`}>
      {children}
    </div>
  );
}
