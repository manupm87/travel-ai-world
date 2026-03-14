"use client";

import Image from "next/image";
import { Container } from "@/components/ui/Container";
import { Button } from "@/components/ui/Button";
import { useLanguage } from "@/context/LanguageContext";

export default function HeroSection() {
  const { t } = useLanguage();
  const h = t.hero;

  return (
    <section className="relative min-h-screen flex flex-col bg-bg-primary pt-[72px]">
      <Container className="pt-20 pb-16 flex flex-col gap-10">
        {/* Badge */}
        <div className="flex items-center gap-2 w-fit px-4 py-2 rounded-full bg-accent-soft border border-accent-border">
          <span className="w-1.5 h-1.5 rounded-full bg-accent inline-block" />
          <span className="text-accent text-xs font-semibold tracking-[1px]">
            {h.badge}
          </span>
        </div>

        {/* Headline */}
        <h1 className="text-4xl md:text-6xl lg:text-[88px] font-bold text-white leading-[1.1] md:leading-[1.0] tracking-[-1px] md:tracking-[-2px] max-w-4xl whitespace-pre-line">
          {h.title}
        </h1>

        {/* Subtitle */}
        <p className="text-lg md:text-xl text-text-secondary leading-relaxed max-w-[640px]">
          {h.subtitle}
        </p>

        {/* CTAs */}
        <div className="flex flex-wrap items-center gap-4">
          <Button href="#planner">
            {h.ctaPrimary}
          </Button>
          <Button href="#how-it-works" variant="secondary">
            {h.ctaSecondary}
          </Button>
        </div>

        {/* Trust */}
        <div className="flex flex-wrap gap-8">
          <span className="text-sm text-text-secondary">{h.trust1}</span>
          <span className="text-sm text-text-secondary">{h.trust2}</span>
          <span className="text-sm text-text-secondary">{h.trust3}</span>
        </div>

        {/* Hero Image */}
        <div className="relative w-full h-[480px] rounded-2xl overflow-hidden mt-4">
          <Image
            src="https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=1440&q=85"
            alt="Dramatic mountain landscape at sunset for travel"
            fill
            className="object-cover"
            priority
            sizes="(max-width: 1440px) 100vw, 1440px"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-bg-primary/60 via-transparent to-transparent" />
        </div>
      </Container>
    </section>
  );
}
