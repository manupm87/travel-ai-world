import React from "react";
import { Activity } from "@/types/trip";
import { formatCurrency } from "@/utils/format";
import { useLanguage } from "@/context/LanguageContext";

interface ActivityItemProps {
  activity: Activity;
  currency: string;
}

export function ActivityItem({ activity, currency }: ActivityItemProps) {
  const { t, language } = useLanguage();
  let bgColor = "bg-white/5";
  if (activity.category === "transport") bgColor = "bg-gold/10";
  if (activity.category === "accommodation") bgColor = "bg-accent/10";

  return (
    <div className={`${bgColor} rounded-lg p-4 flex gap-4 items-start`}>
      <div className="text-text-secondary text-sm font-semibold w-16 shrink-0 mt-0.5 whitespace-nowrap">
        {activity.time}
      </div>
      <div className="flex flex-col gap-1 flex-1">
        <div className="flex justify-between items-start gap-2">
          <span className="text-white font-semibold">{activity.title}</span>
          {activity.cost > 0 && (
            <span className="text-white/90 text-sm font-medium shrink-0">
              {formatCurrency(activity.cost, currency, language === "en" ? "en-US" : "es-ES")}
            </span>
          )}
        </div>
        <span className="text-text-secondary text-sm leading-relaxed">{activity.description}</span>
        
        <div className="flex items-center gap-2 mt-2">
          {activity.bookingRequired && (
            <span className="text-[10px] uppercase font-bold text-red-400 bg-red-400/10 px-2 py-0.5 rounded">{t.tripViewer.bookingRequired}</span>
          )}
          {activity.rating && (
            <span className="text-[11px] font-bold text-yellow-500 bg-yellow-500/10 px-2 py-0.5 rounded flex items-center gap-1">
              ★ {activity.rating}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
