"use client";

import { useLanguage } from "@/context/LanguageContext";

export default function FeaturesSection() {
  const { t } = useLanguage();
  const f = t.features;

  return (
    <section id="features" className="bg-[#0E0E1A] py-24 px-8 lg:px-16">
      <div className="max-w-[1440px] mx-auto flex flex-col gap-16">
        <div className="flex flex-col gap-4">
          <p className="text-[#4F6EF7] text-[11px] font-bold tracking-[3px] uppercase">
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
                  ? "bg-[#4F6EF715] border-[#4F6EF730]"
                  : "bg-[#13132A] border-white/5 hover:border-white/10"
              }`}
            >
              <span className="text-3xl">{feat.emoji}</span>
              <h3 className="text-lg font-bold text-white">{feat.title}</h3>
              <p className="text-[13px] text-[#8888AA] leading-relaxed">
                {feat.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
