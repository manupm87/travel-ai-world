import React from "react";
import { formatCurrency } from "@/utils/format";

interface BudgetCardProps {
  label: string;
  value: number;
  currency: string;
  language: string;
}

export function BudgetCard({ label, value, currency, language }: BudgetCardProps) {
  return (
    <div className="bg-white/5 border border-white/5 rounded-xl p-3 md:p-4 flex flex-col gap-1">
      <span className="text-[10px] text-text-secondary uppercase tracking-widest font-bold">{label}</span>
      <span className="text-white font-bold text-lg">{formatCurrency(value, currency, language === "en" ? "en-US" : "es-ES")}</span>
    </div>
  );
}
