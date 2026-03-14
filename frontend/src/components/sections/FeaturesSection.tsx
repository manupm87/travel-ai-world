"use client";

import { Container } from "@/components/ui/Container";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { Card } from "@/components/ui/Card";
import { useLanguage } from "@/context/LanguageContext";
import { Brain, Calendar, Banknote, Map, Utensils, Edit3 } from "lucide-react";

const ICON_MAP = [Brain, Calendar, Banknote, Map, Utensils, Edit3];

export default function FeaturesSection() {
  const { t } = useLanguage();
  const f = t.features;

  return (
    <section id="features" className="bg-bg-secondary py-24">
      <Container className="flex flex-col gap-16">
        <div className="flex flex-col gap-4">
          <SectionLabel>{f.label}</SectionLabel>
          <h2 className="text-3xl md:text-4xl lg:text-[56px] font-bold text-white tracking-[-1px] md:tracking-[-1.5px] leading-tight whitespace-pre-line">
            {f.title}
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {f.items.map((feat, i) => (
            <Card
              key={feat.title}
              highlight={i === 2}
              className="flex flex-col gap-4 hover:scale-[1.01] transition-all group"
            >
              <div className="w-12 h-12 rounded-xl bg-accent/10 flex items-center justify-center text-accent group-hover:bg-accent group-hover:text-white transition-all duration-300">
                {(() => {
                  const Icon = ICON_MAP[i];
                  return <Icon size={24} strokeWidth={2} />;
                })()}
              </div>
              <h3 className="text-lg font-bold text-white group-hover:text-accent transition-colors duration-300">
                {feat.title}
              </h3>
              <p className="text-[13px] text-text-secondary leading-relaxed">
                {feat.description}
              </p>
            </Card>
          ))}
        </div>
      </Container>
    </section>
  );
}
