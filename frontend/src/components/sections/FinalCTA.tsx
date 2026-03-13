"use client";

import Image from "next/image";
import Link from "next/link";
import { useLanguage } from "@/context/LanguageContext";

export default function FinalCTA() {
  const { t } = useLanguage();
  const c = t.finalCta;

  return (
    <section className="relative py-24 overflow-hidden">
      {/* Background circles */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-[1440px] h-full overflow-hidden pointer-events-none">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-[#4F6EF7]/20 rounded-full blur-[120px]" />
        <div className="absolute top-0 left-1/4 w-[400px] h-[400px] bg-[#3B5BDB]/20 rounded-full blur-[100px]" />
        <div className="absolute bottom-0 right-1/4 w-[600px] h-[600px] bg-[#8888AA]/10 rounded-full blur-[100px]" />
        <div className="absolute inset-0 bg-[#4F6EF7]/80" />
      </div>

      <div className="relative max-w-[1440px] w-full mx-auto px-8 lg:px-16 flex flex-col gap-8">
        <h2 className="text-5xl xl:text-[68px] font-bold text-white tracking-[-2px] leading-[1.0] max-w-3xl">
          {c.title}
        </h2>
        <p className="text-xl text-white/80 leading-relaxed max-w-[600px]">
          {c.subtitle}
        </p>
        <div className="flex flex-wrap gap-4">
          <Link
            href="#planner"
            className="bg-white hover:bg-white/90 transition-all duration-200 text-[#4F6EF7] font-bold text-lg px-10 py-[18px] rounded-xl shadow-xl"
          >
            {c.ctaPrimary}
          </Link>
          <button className="bg-white/10 hover:bg-white/20 border border-white/30 transition-all duration-200 text-white font-semibold text-lg px-10 py-[18px] rounded-xl cursor-pointer">
            {c.ctaSecondary}
          </button>
        </div>
      </div>
    </section>
  );
}
