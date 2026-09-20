import React from "react";
import { CloudSun, Lightbulb } from "lucide-react";
import { Section } from "@/components/ui/Section";
import { Card } from "@/components/ui/Card";
import { useLanguage } from "@/context/LanguageContext";
import type { Trip } from "@/types/trip";

interface AIInsightsProps {
  trip: Trip;
}

/**
 * What to expect (`trip-viewer`).
 *
 * The weather the trip is likely to get and the things a local would tell you,
 * on two glass cards so the dusk horizon keeps showing through them. The
 * section says what it holds in its own heading — the eyebrow above it was
 * saying the same thing twice (TRA-193).
 */
export default function AIInsights({ trip }: AIInsightsProps) {
  const { t } = useLanguage();
  const insights = trip.aiInsights;

  // Fallback content if insights are missing
  const weatherText = insights?.weatherForecast || t.tripViewer.weatherUnavailable;

  const renderTips = () => {
    const tips = insights?.localTips ?? [];
    if (tips.length === 0) {
      return (
        <p className="text-[13px] leading-relaxed text-text-secondary">
          {t.tripViewer.noLocalTips}
        </p>
      );
    }
    return (
      <ul className="flex list-disc flex-col gap-1 pl-4 text-[13px] leading-relaxed text-text-secondary">
        {tips.map((tip, index) => (
          <li key={index}>{tip}</li>
        ))}
      </ul>
    );
  };

  return (
    <Section variant="transparent" padding="medium">
      <h2 className="mb-5 text-2xl font-light text-text-primary">
        {t.tripViewer.aiInsights}
      </h2>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card variant="glass" className="flex items-start gap-4">
          <CloudSun size={22} aria-hidden="true" className="mt-0.5 shrink-0 text-accent" />
          <div className="flex flex-col gap-2">
            <h3 className="text-base font-medium text-text-primary">
              {t.tripViewer.weatherForecast}
            </h3>
            <p className="text-[13px] leading-relaxed text-text-secondary">{weatherText}</p>
          </div>
        </Card>

        <Card variant="glass" className="flex h-full items-start gap-4">
          <Lightbulb size={22} aria-hidden="true" className="mt-0.5 shrink-0 text-gold" />
          <div className="flex w-full flex-col gap-2">
            <h3 className="text-base font-medium text-text-primary">
              {t.tripViewer.localTips}
            </h3>
            {renderTips()}
          </div>
        </Card>
      </div>
    </Section>
  );
}
