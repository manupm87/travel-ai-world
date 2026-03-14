"use client";

import { useState } from "react";
import { useLanguage } from "@/context/LanguageContext";
import { SectionLabel } from "@/components/ui/SectionLabel";

interface PlannerCardProps {
  transparent?: boolean;
}


/**
 * AI Trip Planner Form.
 * 
 * This shared component renders the interactive form where users input their desired
 * destination, dates, budget, and travel style to generate a new itinerary.
 * It is used both as the main hero CTAs on the landing page and as the top
 * action block in the user Dashboard.
 * 
 * @param transparent - If true, removes the background color and reduces padding.
 */
export default function PlannerCard({ transparent = false }: PlannerCardProps) {
  const { t } = useLanguage();
  const p = t.planner;

  const [selectedStyles, setSelectedStyles] = useState<string[]>([]);
  const [submitted, setSubmitted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [form, setForm] = useState({
    destination: "",
    dates: "",
    budget: "",
    travelers: "",
  });

  const toggleStyle = (label: string) => {
    setSelectedStyles((prev) =>
      prev.includes(label) ? prev.filter((s) => s !== label) : [...prev, label]
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    
    // Simulate AI Generation
    setTimeout(() => {
      setIsLoading(false);
      setSubmitted(true);
      setTimeout(() => setSubmitted(false), 4000);
    }, 2500);
  };

  return (
    <section id="planner" className={`${transparent ? "bg-transparent py-12" : "bg-bg-secondary py-24"}`}>
      <div className="max-w-[1440px] w-full mx-auto px-8 lg:px-16 flex flex-col gap-10">
        <div className="flex flex-col gap-4">
          <SectionLabel>{p.label}</SectionLabel>
          <h2 className="text-4xl lg:text-5xl font-bold text-white tracking-[-1px] leading-tight">
            {p.title}
          </h2>
        </div>

        <form
          onSubmit={handleSubmit}
          className="bg-bg-card border border-border rounded-2xl p-8 lg:p-12 flex flex-col gap-8"
        >
          {/* Inputs */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { key: "destination", label: p.destination, placeholder: p.destinationPlaceholder },
              { key: "dates", label: p.dates, placeholder: p.datesPlaceholder },
              { key: "budget", label: p.budget, placeholder: p.budgetPlaceholder },
              { key: "travelers", label: p.travelers, placeholder: p.travelersPlaceholder },
            ].map(({ key, label, placeholder }) => (
              <div key={key} className="flex flex-col gap-2.5">
                <label className="text-[12px] font-bold text-text-secondary tracking-[0.1em] uppercase">
                  {label}
                </label>
                <input
                  type="text"
                  placeholder={placeholder}
                  value={form[key as keyof typeof form]}
                  onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                  className="h-[52px] bg-bg-primary border border-border-soft rounded-xl px-4 text-[15px] text-white placeholder-white/50 focus:outline-none focus:border-accent/60 transition-colors"
                />
              </div>
            ))}
          </div>

          {/* Style pills */}
          <div className="flex flex-col gap-4">
            <label className="text-[12px] font-bold text-text-secondary tracking-[0.1em] uppercase">
              {p.travelStyle}
            </label>
            <div className="flex flex-wrap gap-3">
              {p.styles.map(({ emoji, label }) => {
                const active = selectedStyles.includes(label);
                return (
                  <button
                    key={label}
                    type="button"
                    onClick={() => toggleStyle(label)}
                    aria-pressed={active}
                    className={`flex items-center gap-2 px-6 py-3 rounded-xl text-[13.5px] font-semibold transition-all duration-300 cursor-pointer ${
                      active
                        ? "bg-accent text-white shadow-lg shadow-accent/40"
                        : "bg-white/5 border border-border-soft text-white/70 hover:bg-white/10 hover:text-white"
                    }`}
                  >
                    <span>{emoji}</span>
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={isLoading || submitted}
            className={`w-full h-16 bg-accent hover:bg-accent-hover text-white font-bold text-lg rounded-xl transition-all duration-300 shadow-lg shadow-accent/40 flex items-center justify-center gap-3 cursor-pointer disabled:cursor-not-allowed disabled:opacity-80 active:scale-[0.98] ${
              isLoading ? "animate-pulse" : ""
            }`}
          >
            {isLoading ? (
              <>
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span>{p.comingSoon || "AI is thinking..."}</span>
              </>
            ) : submitted ? (
              <><span>🎉</span><span>{p.comingSoon}</span></>
            ) : (
              <><span>✨</span><span>{p.generate}</span></>
            )}
          </button>

          {submitted && (
            <p className="text-center text-sm text-text-secondary">{p.comingSoonNote}</p>
          )}
        </form>
      </div>
    </section>
  );
}
