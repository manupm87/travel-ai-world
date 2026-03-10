"use client";

import Image from "next/image";
import Link from "next/link";
import { useLanguage } from "@/context/LanguageContext";

export default function FinalCTA() {
  const { t } = useLanguage();
  const c = t.finalCta;

  return (
    <section className="bg-[#4F6EF7] py-24 px-8 lg:px-16 relative overflow-hidden">
      <div className="absolute inset-0">
        <Image
          src="https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=1440&q=80"
          alt="Beautiful tropical beach at sunset"
          fill
          className="object-cover opacity-20"
          sizes="100vw"
        />
        <div className="absolute inset-0 bg-[#4F6EF7]/80" />
      </div>

      <div className="relative max-w-[1440px] mx-auto flex flex-col gap-8">
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
