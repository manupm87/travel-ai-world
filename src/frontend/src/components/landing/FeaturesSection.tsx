"use client";

import { Container } from "@/components/ui/Container";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { Card } from "@/components/ui/Card";
import { useLanguage } from "@/context/LanguageContext";
import type { FeatureId } from "@/i18n";
import {
  Brain,
  Calendar,
  Banknote,
  Map,
  Utensils,
  Edit3,
  type LucideIcon,
} from "lucide-react";

/** Icon per feature, keyed on the translated item's id. */
const FEATURE_ICONS: Record<FeatureId, LucideIcon> = {
  personalized: Brain,
  itineraries: Calendar,
  budget: Banknote,
  maps: Map,
  food: Utensils,
  customizable: Edit3,
};

/**
 * Marketing Value Propositions (`landing`).
 *
 * Renders the "Features" section of the landing page, displaying a grid of cards
 * that highlight the core capabilities of the Travel AI product.
 */
export default function FeaturesSection() {
  const { t } = useLanguage();
  const f = t.features;

  return (
    <section id="features" className="bg-bg-secondary py-24">
      <Container className="flex flex-col gap-16">
        <div className="flex flex-col gap-4">
          <SectionLabel>{f.label}</SectionLabel>
          <h2 className="text-3xl md:text-4xl lg:text-[56px] font-medium text-text-primary tracking-[-1px] md:tracking-[-1.5px] leading-tight whitespace-pre-line">
            {f.title}
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {f.items.map((feat, i) => {
            const Icon = FEATURE_ICONS[feat.id];
            return (
              <Card
                key={feat.id}
                highlight={i === 2}
                className="flex flex-col gap-4 hover:scale-[1.01] transition-all group"
              >
                <div className="w-12 h-12 rounded-xl bg-accent/10 flex items-center justify-center text-accent group-hover:bg-accent group-hover:text-white transition-all duration-300">
                  <Icon size={24} strokeWidth={2} aria-hidden="true" />
                </div>
                <h3 className="text-lg font-medium text-text-primary group-hover:text-accent transition-colors duration-300">
                  {feat.title}
                </h3>
                <p className="text-[13px] text-text-secondary leading-relaxed">
                  {feat.description}
                </p>
              </Card>
            );
          })}
        </div>
      </Container>
    </section>
  );
}
