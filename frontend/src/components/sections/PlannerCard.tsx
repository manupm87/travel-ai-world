"use client";

import { useState } from "react";
import { useLanguage } from "@/context/LanguageContext";

interface PlannerCardProps {
  transparent?: boolean;
}

export default function PlannerCard({ transparent = false }: PlannerCardProps) {
  const { t } = useLanguage();
  const p = t.planner;

  const [selectedStyles, setSelectedStyles] = useState<string[]>([]);
  const [submitted, setSubmitted] = useState(false);
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
    setSubmitted(true);
    setTimeout(() => setSubmitted(false), 4000);
  };

  return (
    <section id="planner" className={`${transparent ? "bg-transparent py-12" : "bg-[#0E0E1A] py-24"} px-8 lg:px-16`}>
      <div className="max-w-[1440px] mx-auto flex flex-col gap-10">
        <div className="flex flex-col gap-4">
          <p className="text-[#4F6EF7] text-[11px] font-bold tracking-[3px] uppercase">
            {p.label}
          </p>
          <h2 className="text-4xl lg:text-5xl font-bold text-white tracking-[-1px] leading-tight">
            {p.title}
          </h2>
        </div>

        <form
          onSubmit={handleSubmit}
          className="bg-[#13132A] border border-white/5 rounded-2xl p-8 lg:p-12 flex flex-col gap-8"
        >
          {/* Inputs */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { key: "destination", label: p.destination, placeholder: p.destinationPlaceholder },
              { key: "dates", label: p.dates, placeholder: p.datesPlaceholder },
              { key: "budget", label: p.budget, placeholder: p.budgetPlaceholder },
              { key: "travelers", label: p.travelers, placeholder: p.travelersPlaceholder },
            ].map(({ key, label, placeholder }) => (
              <div key={key} className="flex flex-col gap-2">
                <label className="text-[10px] font-bold text-[#8888AA] tracking-[2px] uppercase">
                  {label}
                </label>
                <input
                  type="text"
                  placeholder={placeholder}
                  value={form[key as keyof typeof form]}
                  onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                  className="h-[52px] bg-[#0A0A1A] border border-white/10 rounded-xl px-4 text-[15px] text-white placeholder-white/30 focus:outline-none focus:border-[#4F6EF7]/60 transition-colors"
                />
              </div>
            ))}
          </div>

          {/* Style pills */}
          <div className="flex flex-col gap-3">
            <label className="text-[10px] font-bold text-[#8888AA] tracking-[2px] uppercase">
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
                    className={`flex items-center gap-2 px-5 py-2.5 rounded-full text-[13px] font-semibold transition-all duration-200 cursor-pointer ${
                      active
                        ? "bg-[#4F6EF7] text-white shadow-lg shadow-[#4F6EF740]"
                        : "bg-white/5 border border-white/10 text-white/70 hover:bg-white/10 hover:text-white"
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
            className="w-full h-16 bg-[#4F6EF7] hover:bg-[#3B5BDB] text-white font-bold text-lg rounded-xl transition-all duration-200 shadow-lg shadow-[#4F6EF740] flex items-center justify-center gap-3 cursor-pointer"
          >
            {submitted ? (
              <><span>🎉</span><span>{p.comingSoon}</span></>
            ) : (
              <><span>✨</span><span>{p.generate}</span></>
            )}
          </button>

          {submitted && (
            <p className="text-center text-sm text-[#8888AA]">{p.comingSoonNote}</p>
          )}
        </form>
      </div>
    </section>
  );
}
