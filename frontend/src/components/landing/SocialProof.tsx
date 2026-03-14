"use client";

import { Container } from "@/components/ui/Container";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { Card } from "@/components/ui/Card";
import { useLanguage } from "@/context/LanguageContext";


/**
 * Testimonials & Metrics (`landing`).
 * 
 * Renders the "Social Proof" section on the landing page. Includes a grid of
 * overarching platform statistics (users, locations) followed by a grid of
 * user quote testimonials.
 */
export default function SocialProof() {
  const { t } = useLanguage();
  const s = t.socialProof;

  return (
    <section id="testimonials" className="bg-bg-primary py-24">
      <Container className="flex flex-col gap-16">
        <SectionLabel>{s.label}</SectionLabel>

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
          {s.stats.map((stat) => (
            <Card
              key={stat.label}
              className="flex flex-col gap-2"
            >
              <span className="text-accent text-4xl lg:text-5xl font-bold tracking-[-2px]">
                {stat.value}
              </span>
              <span className="text-text-secondary text-sm">{stat.label}</span>
            </Card>
          ))}
        </div>

        {/* Testimonials */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {s.testimonials.map((testimonial) => (
            <Card
              key={testimonial.author}
              highlight={testimonial.highlight}
              className="flex flex-col gap-4"
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
            </Card>
          ))}
        </div>
      </Container>
    </section>
  );
}
