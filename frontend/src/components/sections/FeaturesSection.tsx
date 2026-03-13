"use client";

import { useLanguage } from "@/context/LanguageContext";

export default function FeaturesSection() {
  const { t } = useLanguage();
  const f = t.features;

  return (
    <section id="features" className="bg-bg-secondary py-24">
      <div className="max-w-[1440px] w-full mx-auto px-8 lg:px-16 flex flex-col gap-16">
        <div className="flex flex-col gap-4">
          <p className="text-accent text-[11px] font-bold tracking-[3px] uppercase">
            {f.label}
          </p>
          <h2 className="text-4xl lg:text-[56px] font-bold text-white tracking-[-1.5px] leading-tight whitespace-pre-line">
            {f.title}
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {f.items.map((feat, i) => (
            <div
              key={feat.title}
              className={`flex flex-col gap-4 p-8 rounded-2xl border transition-all hover:scale-[1.01] ${
                i === 2
                  ? "bg-[#4F6EF715] border-accent-border"
                  : "bg-bg-card border-border hover:border-border-soft"
              }`}
            >
              <span className="text-3xl">{feat.emoji}</span>
              <h3 className="text-lg font-bold text-white">{feat.title}</h3>
              <p className="text-[13px] text-text-secondary leading-relaxed">
                {feat.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
