"use client";

import Image from "next/image";
import { useLanguage } from "@/context/LanguageContext";

const STEP_IMAGES = [
  { src: "https://images.unsplash.com/photo-1488646953014-85cb44e25828?w=600&q=80", alt: "Person planning a trip on laptop" },
  { src: "https://images.unsplash.com/photo-1677442135703-1787eea5ce01?w=600&q=80", alt: "AI generating a travel plan" },
  { src: "https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?w=600&q=80", alt: "Happy couple traveling" },
];

export default function HowItWorks() {
  const { t } = useLanguage();
  const h = t.howItWorks;

  return (
    <section id="how-it-works" className="bg-[#0A0A12] py-24">
      <div className="max-w-[1440px] w-full mx-auto px-8 lg:px-16 flex flex-col gap-16">
        <div className="flex flex-col gap-4">
          <p className="text-[#4F6EF7] text-[11px] font-bold tracking-[3px] uppercase">
            {h.label}
          </p>
          <h2 className="text-4xl lg:text-[56px] font-bold text-white tracking-[-1.5px] leading-tight whitespace-pre-line">
            {h.title}
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {h.steps.map((step, i) => (
            <div
              key={step.number}
              className={`flex flex-col gap-5 p-8 rounded-2xl border ${
                i === 0
                  ? "bg-[#13132A] border-[#4F6EF730]"
                  : "bg-[#13132A] border-white/5"
              }`}
            >
              <div
                className={`w-11 h-11 rounded-full flex items-center justify-center text-lg font-bold text-white ${
                  i === 0 ? "bg-[#4F6EF7]" : "bg-white/10"
                }`}
              >
                {step.number}
              </div>
              <div className="relative w-full h-[180px] rounded-xl overflow-hidden">
                <Image
                  src={STEP_IMAGES[i].src}
                  alt={STEP_IMAGES[i].alt}
                  fill
                  className="object-cover"
                  sizes="(max-width: 768px) 100vw, 33vw"
                />
              </div>
              <h3 className="text-xl font-bold text-white">{step.title}</h3>
              <p className="text-sm text-[#8888AA] leading-relaxed">{step.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
