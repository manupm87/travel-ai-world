import React, { useState } from "react";
import { Card } from "@/components/ui/Card";
import { ItineraryDay } from "@/types/trip";
import { formatDate, formatCurrency } from "@/utils/format";
import { useLanguage } from "@/context/LanguageContext";
import { ActivityItem } from "./ActivityItem";

interface DayCardProps {
  day: ItineraryDay;
  currency: string;
}


/**
 * Daily Itinerary Expandable Card.
 * 
 * Renders a high-level overview of a single day within the trip timeline.
 * Users can click the card to expand it and reveal the full chronological list
 * of `ActivityItem`s and dining reservations for that specific day.
 * 
 * @param day - The ItineraryDay data object containing activities and meals.
 * @param currency - The currency code used for formatting estimated costs.
 */
export function DayCard({ day, currency }: DayCardProps) {
  const { t, language } = useLanguage();
  const [expanded, setExpanded] = useState(false);
  
  const isFreeDay = day.title.toLowerCase().includes("free day") || day.title.toLowerCase().includes("día libre");
  const hasTravel = day.activities.some(a => a.category === "transport");
  
  let primaryColor = "bg-accent";
  let textColor = "text-accent";
  let badgeText = "";
  
  if (isFreeDay) {
    primaryColor = "bg-purple";
    textColor = "text-purple";
    badgeText = t.tripViewer.freeDay;
  } else if (hasTravel) {
    primaryColor = "bg-gold";
    textColor = "text-gold";
    badgeText = t.tripViewer.travel;
  }

  return (
    <Card className={`transition-all rounded-[20px] ${expanded ? "ring-1 ring-border-soft" : ""}`}>
      {/* Header */}
      <button 
        type="button"
        className="w-full flex gap-4 cursor-pointer items-start text-left bg-transparent border-none p-0 outline-none focus-visible:ring-2 focus-visible:ring-accent rounded-xl" 
        onClick={() => setExpanded(!expanded)}
      >
        <div className={`w-12 h-12 rounded-full flex items-center justify-center shrink-0 ${primaryColor}`}>
          <span className="text-white text-xl font-bold">{day.dayNumber}</span>
        </div>
        
        <div className="flex-1 flex flex-col gap-1">
          {badgeText && (
            <div className={`text-[9px] font-bold tracking-[1.5px] px-2.5 py-1 rounded-full w-fit mb-1 ${
              isFreeDay ? "bg-purple/20" : hasTravel ? "bg-gold/20" : "bg-accent/20"
            }`}>
              <span className={textColor}>{badgeText}</span>
            </div>
          )}
          
          <h4 className="text-white text-xl font-bold">{day.title}</h4>
          <p className="text-text-secondary text-sm">
            {formatDate(day.date, language === "en" ? "en-US" : "es-ES", { weekday: "long", month: "short", day: "numeric" })} • {day.estimatedCost > 0 ? `${formatCurrency(day.estimatedCost, currency, language === "en" ? "en-US" : "es-ES")} ${t.tripViewer.estimated}` : t.tripViewer.selfPlanned}
          </p>
        </div>
        
        <div className="text-text-secondary text-xs pt-2">
          {expanded ? "▼" : "▶"}
        </div>
      </button>

      {/* Expanded Content */}
      {expanded && (
        <div className="pl-6 md:pl-16 flex flex-col gap-4 mt-2 pb-2">
          <p className="text-white/80 text-sm leading-relaxed">{day.description}</p>
          
          {day.activities.length > 0 && (
            <div className="flex flex-col gap-3">
              {[...day.activities]
                .sort((a, b) => a.time.localeCompare(b.time))
                .map(act => (
                  <ActivityItem key={act.id} activity={act} currency={currency} />
                ))}
            </div>
          )}
          
          {day.meals.length > 0 && (
            <div className="flex flex-col gap-3 mt-2">
              <h5 className="text-text-secondary text-xs font-bold uppercase tracking-wider">{t.tripViewer.dining}</h5>
              {day.meals.map(meal => (
                <div key={meal.id} className="bg-white/5 rounded-lg p-4 flex gap-4">
                  <div className="text-text-secondary text-sm font-semibold w-16">{meal.time}</div>
                  <div className="flex flex-col">
                    <span className="text-white font-semibold">{meal.restaurantName}</span>
                    <span className="text-text-secondary text-sm">{meal.cuisine} • {formatCurrency(meal.estimatedCost, currency, language === "en" ? "en-US" : "es-ES")}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
