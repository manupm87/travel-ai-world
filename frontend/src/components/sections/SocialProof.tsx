"use client";

import { useLanguage } from "@/context/LanguageContext";

export default function SocialProof() {
  const { t } = useLanguage();
  const s = t.socialProof;

  return (
    <section id="testimonials" className="bg-[#0A0A12] py-24">
      <div className="max-w-[1440px] w-full mx-auto px-8 lg:px-16 flex flex-col gap-16">
        <p className="text-[#4F6EF7] text-[11px] font-bold tracking-[3px] uppercase">
          {s.label}
        </p>

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
          {s.stats.map((stat) => (
            <div
              key={stat.label}
              className="flex flex-col gap-2 p-8 rounded-2xl bg-[#13132A] border border-white/5"
            >
              <span className="text-[#4F6EF7] text-4xl lg:text-5xl font-bold tracking-[-2px]">
                {stat.value}
              </span>
              <span className="text-[#8888AA] text-sm">{stat.label}</span>
            </div>
          ))}
        </div>

        {/* Testimonials */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {s.testimonials.map((testimonial) => (
            <div
              key={testimonial.author}
              className={`flex flex-col gap-4 p-8 rounded-2xl border ${
                testimonial.highlight
                  ? "bg-[#4F6EF712] border-[#4F6EF730]"
                  : "bg-[#13132A] border-white/5"
              }`}
            >
              <span className="text-[#F5A623] text-base">
                {"★".repeat(testimonial.stars)}
              </span>
              <p className="text-white text-[15px] leading-relaxed flex-1">
                &ldquo;{testimonial.quote}&rdquo;
              </p>
              <div className="flex flex-col gap-0.5 pt-2 border-t border-white/5">
                <span className="text-white font-semibold text-sm">{testimonial.author}</span>
                <span className="text-[#8888AA] text-xs">{testimonial.location}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
