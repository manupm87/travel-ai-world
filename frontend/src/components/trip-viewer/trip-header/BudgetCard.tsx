import React from "react";
import { formatCurrency } from "@/utils/format";

interface BudgetCardProps {
  label: string;
  value: number;
  currency: string;
  language: string;
}


/**
 * Micro UI: Budget Breakdown Metric.
 * 
 * A small, self-contained stat card used within the `TripHeader` to display
 * specific budget allocations (e.g., specifically how much was spent on Food).
 */
export function BudgetCard({ label, value, currency, language }: BudgetCardProps) {
  return (
    <div className="bg-bg-secondary border border-border-soft rounded-xl p-3 md:p-4 flex flex-col gap-1">
      <span className="text-[10px] text-text-primary uppercase tracking-widest font-bold">{label}</span>
      <span className="text-text-primary font-bold text-lg">{formatCurrency(value, currency, language === "en" ? "en-US" : "es-ES")}</span>
    </div>
  );
}
