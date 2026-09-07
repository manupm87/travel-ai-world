"use client";

import React from "react";
import { Button } from "@/components/ui/Button";
import { useLanguage } from "@/context/LanguageContext";
import { PlaneTakeoff } from "lucide-react";


/**
 * Dashboard Empty State.
 * 
 * Renders a friendly prompt when a user has no trips in their account.
 * Encourages them to scroll down or click the CTA to use the AI Planner.
 */
export default function EmptyDashboard() {
  const { t } = useLanguage();

  return (
    <div className="flex flex-col items-center justify-center py-20 px-8 text-center animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="w-24 h-24 rounded-full bg-accent/10 flex items-center justify-center text-accent mb-8 shadow-accent-glow">
        <PlaneTakeoff size={48} strokeWidth={1.5} />
      </div>
      
      <h2 className="text-3xl font-medium text-text-primary mb-4 tracking-tight">
        {t.dashboard.emptyTitle}
      </h2>

      <p className="text-text-secondary text-lg max-w-[480px] mb-10 leading-relaxed">
        {t.dashboard.emptyDescription}
      </p>
      
      <Button href="#planner">
        <span>✨</span>
        <span className="ml-2">{t.planner.label}</span>
      </Button>
    </div>
  );
}
