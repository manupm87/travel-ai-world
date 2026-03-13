import React from "react";
import { Trip } from "@/types/trip";
import { Container } from "@/components/ui/Container";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { Card } from "@/components/ui/Card";
import { useLanguage } from "@/context/LanguageContext";

interface AIInsightsProps {
  trip: Trip;
}

export default function AIInsights({}: AIInsightsProps) {
  const { t } = useLanguage();

  return (
    <section className="w-full bg-transparent py-10">
      <Container className="flex flex-col gap-6">
        <SectionLabel>{t.tripViewer.aiInsights}</SectionLabel>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Weather Card */}
          <Card highlight={true} className="flex items-start gap-4 border-none shadow-none">
            <div role="img" aria-label="Sun" className="text-4xl">🌤️</div>
            <div className="flex flex-col gap-2">
              <h3 className="text-white text-base font-bold">{t.tripViewer.weatherForecast}</h3>
              <p className="text-text-secondary text-[13px] leading-relaxed">
                Perfect spring weather across all cities! Paris 18-22°C, Rome 20-25°C, Barcelona 19-24°C.
              </p>
            </div>
          </Card>

          {/* Local Tips Card */}
          <Card className="flex items-start gap-4">
            <div role="img" aria-label="Lightbulb" className="text-4xl">💡</div>
            <div className="flex flex-col gap-2">
              <h3 className="text-white text-base font-bold">{t.tripViewer.localTips}</h3>
              <p className="text-text-secondary text-[13px] leading-relaxed">
                Buy a Paris Museum Pass for skip-the-line access. Book Colosseum tickets 2 weeks in advance.
              </p>
            </div>
          </Card>
        </div>
      </Container>
    </section>
  );
}
