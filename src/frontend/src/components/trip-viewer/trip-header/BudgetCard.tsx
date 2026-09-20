import React from "react";
import { useFormatters } from "@/hooks/useFormatters";

interface BudgetCardProps {
  label: string;
  value: number;
  currency: string;
}


/**
 * Micro UI: Budget Breakdown Metric.
 *
 * A small, self-contained stat card used within the `TripHeader` to display
 * specific budget allocations (e.g., specifically how much was spent on Food).
 */
export function BudgetCard({ label, value, currency }: BudgetCardProps) {
  const { formatCurrency } = useFormatters();

  return (
    <div className="flex flex-col gap-1 rounded-xl border border-glass-border bg-glass-bg p-3 backdrop-blur-xl md:p-4">
      <span className="text-xs text-text-secondary">{label}</span>
      <span className="text-lg font-medium text-text-primary">
        {formatCurrency(value, currency)}
      </span>
    </div>
  );
}
