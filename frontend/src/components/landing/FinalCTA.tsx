"use client";

import { Container } from "@/components/ui/Container";
import { Button } from "@/components/ui/Button";
import { useLanguage } from "@/context/LanguageContext";


/**
 * Bottom Call-to-Action (`landing`).
 * 
 * Renders the final conversion block at the bottom of the landing page.
 * Uses robust background gradients and blurred circles to create a dramatic,
 * high-contrast visual to encourage users to start planning a trip.
 */
export default function FinalCTA() {
  const { t } = useLanguage();
  const c = t.finalCta;

  return (
    <section className="relative py-24 overflow-hidden">
      {/* Background circles */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-[1440px] h-full overflow-hidden pointer-events-none">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-accent/20 rounded-full blur-[120px]" />
        <div className="absolute top-0 left-1/4 w-[400px] h-[400px] bg-accent-hover/20 rounded-full blur-[100px]" />
        <div className="absolute bottom-0 right-1/4 w-[600px] h-[600px] bg-text-secondary/10 rounded-full blur-[100px]" />
        <div className="absolute inset-0 bg-accent/80" />
      </div>

      <Container className="relative flex flex-col gap-8">
        <h2 className="text-5xl xl:text-[68px] font-medium text-white tracking-[-2px] leading-[1.0] max-w-3xl">
          {c.title}
        </h2>
        <p className="text-xl text-white/80 leading-relaxed max-w-[600px]">
          {c.subtitle}
        </p>
        <div className="flex flex-wrap gap-4">
          <Button 
            href="#planner"
            variant="white"
            className="text-lg px-10 py-[18px] rounded-xl"
          >
            {c.ctaPrimary}
          </Button>
          <Button 
            variant="secondary"
            className="text-white border-white/40 bg-white/10 hover:bg-white/20 text-lg px-10 py-[18px] rounded-xl"
          >
            {c.ctaSecondary}
          </Button>
        </div>
      </Container>
    </section>
  );
}
