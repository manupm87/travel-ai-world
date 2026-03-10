"use client";

import Image from "next/image";
import Link from "next/link";
import { useLanguage } from "@/context/LanguageContext";

export default function HeroSection() {
  const { t } = useLanguage();
  const h = t.hero;

  return (
    <section className="relative min-h-screen flex flex-col bg-[#0A0A12] pt-[72px]">
      <div className="max-w-[1440px] mx-auto px-8 lg:px-16 pt-20 pb-16 flex flex-col gap-10">
        {/* Badge */}
        <div className="flex items-center gap-2 w-fit px-4 py-2 rounded-full bg-[#4F6EF720] border border-[#4F6EF730]">
          <span className="w-1.5 h-1.5 rounded-full bg-[#4F6EF7] inline-block" />
          <span className="text-[#4F6EF7] text-xs font-semibold tracking-[1px]">
            {h.badge}
          </span>
        </div>

        {/* Headline */}
        <h1 className="text-[64px] xl:text-[88px] font-bold text-white leading-[1.0] tracking-[-2px] max-w-4xl whitespace-pre-line">
          {h.title}
        </h1>

        {/* Subtitle */}
        <p className="text-xl text-[#8888AA] leading-relaxed max-w-[640px]">
          {h.subtitle}
        </p>

        {/* CTAs */}
        <div className="flex flex-wrap items-center gap-4">
          <Link
            href="#planner"
            className="bg-[#4F6EF7] hover:bg-[#3B5BDB] transition-all duration-200 text-white font-bold text-base px-9 py-4 rounded-lg shadow-lg shadow-[#4F6EF740]"
          >
            {h.ctaPrimary}
          </Link>
          <Link
            href="#how-it-works"
            className="bg-white/5 hover:bg-white/10 border border-white/10 transition-all duration-200 text-white/80 font-semibold text-base px-9 py-4 rounded-lg"
          >
            {h.ctaSecondary}
          </Link>
        </div>

        {/* Trust */}
        <div className="flex flex-wrap gap-8">
          <span className="text-sm text-[#8888AA]">{h.trust1}</span>
          <span className="text-sm text-[#8888AA]">{h.trust2}</span>
          <span className="text-sm text-[#8888AA]">{h.trust3}</span>
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
          <div className="absolute inset-0 bg-gradient-to-t from-[#0A0A12]/60 via-transparent to-transparent" />
        </div>
      </div>
    </section>
  );
}
