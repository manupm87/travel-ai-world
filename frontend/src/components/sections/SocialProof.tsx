"use client";

import { useLanguage } from "@/context/LanguageContext";

export default function SocialProof() {
  const { t } = useLanguage();
  const s = t.socialProof;

  return (
    <section id="testimonials" className="bg-bg-primary py-24">
      <div className="max-w-[1440px] w-full mx-auto px-8 lg:px-16 flex flex-col gap-16">
        <p className="text-accent text-[11px] font-bold tracking-[3px] uppercase">
          {s.label}
        </p>

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
          {s.stats.map((stat) => (
            <div
              key={stat.label}
              className="flex flex-col gap-2 p-8 rounded-2xl bg-bg-card border border-border"
            >
              <span className="text-accent text-4xl lg:text-5xl font-bold tracking-[-2px]">
                {stat.value}
              </span>
              <span className="text-text-secondary text-sm">{stat.label}</span>
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
                  ? "bg-accent-soft border-accent-border"
                  : "bg-bg-card border-border"
              }`}
            >
              <span className="text-gold text-base">
                {"★".repeat(testimonial.stars)}
              </span>
              <p className="text-white text-[15px] leading-relaxed flex-1">
                &ldquo;{testimonial.quote}&rdquo;
              </p>
              <div className="flex flex-col gap-0.5 pt-2 border-t border-border">
                <span className="text-white font-semibold text-sm">{testimonial.author}</span>
                <span className="text-text-secondary text-xs">{testimonial.location}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
