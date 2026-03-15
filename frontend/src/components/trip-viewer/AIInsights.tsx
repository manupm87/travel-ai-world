import React from "react";
import { Section } from "@/components/ui/Section";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { Card } from "@/components/ui/Card";
import { useLanguage } from "@/context/LanguageContext";
import type { Trip } from "@/types/trip";

interface AIInsightsProps {
  trip: Trip;
}

/**
 * AI Insights Section (`trip-viewer`).
 * 
 * Renders an AI-generated summary of helpful tips and weather forecasts for the
 * currently viewed trip. It uses standard `Card` components to display the data.
 */
export default function AIInsights({ trip }: AIInsightsProps) {
  const { t } = useLanguage();
  const insights = trip.aiInsights;

  // Fallback content if insights are missing
  const weatherText = insights?.weatherForecast || "Weather information currently unavailable for this trip.";
  
  const renderTips = () => {
    if (!insights?.localTips) {
      return <p className="text-text-secondary text-[13px] leading-relaxed">No local tips available yet.</p>;
    }
    
    if (Array.isArray(insights.localTips)) {
      return (
        <ul className="text-text-secondary text-[13px] leading-relaxed list-disc pl-4 flex flex-col gap-1">
          {insights.localTips.map((tip, index) => (
            <li key={index}>{tip}</li>
          ))}
        </ul>
      );
    }
    
    return (
      <p className="text-text-secondary text-[13px] leading-relaxed">
        {insights.localTips}
      </p>
    );
  };

  return (
    <Section variant="transparent" padding="medium">
      <SectionLabel>{t.tripViewer.aiInsights}</SectionLabel>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Weather Card */}
          <Card highlight={true} className="flex items-start gap-4 border-none shadow-none">
            <div role="img" aria-label="Sun" className="text-4xl">🌤️</div>
            <div className="flex flex-col gap-2">
              <h3 className="text-white text-base font-medium">{t.tripViewer.weatherForecast}</h3>
              <p className="text-text-secondary text-[13px] leading-relaxed">
                {weatherText}
              </p>
            </div>
          </Card>

          {/* Local Tips Card */}
          <Card className="flex items-start gap-4 h-full">
            <div role="img" aria-label="Lightbulb" className="text-4xl">💡</div>
            <div className="flex flex-col gap-2 w-full">
              <h3 className="text-white text-base font-medium">{t.tripViewer.localTips}</h3>
              {renderTips()}
            </div>
          </Card>
        </div>
    </Section>
  );
}
