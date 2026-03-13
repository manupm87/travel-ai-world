import React from "react";
import { Card } from "@/components/ui/Card";
import { formatCurrency } from "@/utils/format";

interface BudgetCardProps {
  label: string;
  value: number;
  currency: string;
  language: string;
}

export function BudgetCard({ label, value, currency, language }: BudgetCardProps) {
  return (
    <Card className="p-5 flex flex-col gap-2 rounded-xl">
      <h3 className="text-text-secondary text-[9px] font-bold tracking-[2px]">{label}</h3>
      <p className="text-white text-[28px] font-bold tracking-[-1px]">
        {formatCurrency(value, currency, language === "en" ? "en-US" : "es-ES")}
      </p>
    </Card>
  );
}
