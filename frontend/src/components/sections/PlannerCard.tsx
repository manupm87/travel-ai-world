"use client";

import { useState } from "react";

const STYLE_OPTIONS = [
  { emoji: "🏔", label: "Adventure" },
  { emoji: "🌴", label: "Relaxation" },
  { emoji: "🏛", label: "Culture" },
  { emoji: "🍜", label: "Foodie" },
  { emoji: "💑", label: "Romance" },
  { emoji: "🎒", label: "Backpacker" },
];

export default function PlannerCard() {
  const [selectedStyles, setSelectedStyles] = useState<string[]>(["Adventure"]);
  const [submitted, setSubmitted] = useState(false);
  const [form, setForm] = useState({
    destination: "",
    dates: "",
    budget: "",
    travelers: "",
  });

  const toggleStyle = (label: string) => {
    setSelectedStyles((prev) =>
      prev.includes(label)
        ? prev.filter((s) => s !== label)
        : [...prev, label]
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    setTimeout(() => setSubmitted(false), 4000);
  };

  return (
    <section
      id="planner"
      className="bg-[#0E0E1A] py-24 px-16"
    >
      <div className="max-w-[1440px] mx-auto flex flex-col gap-10">
        {/* Header */}
        <div className="flex flex-col gap-4">
          <p className="text-[#4F6EF7] text-[11px] font-bold tracking-[3px] uppercase">
            Plan Your Trip
          </p>
          <h2 className="text-5xl font-bold text-white tracking-[-1px] leading-tight">
            Tell the AI where you want to go
          </h2>
        </div>

        {/* Card */}
        <form
          onSubmit={handleSubmit}
          className="bg-[#13132A] border border-white/5 rounded-2xl p-12 flex flex-col gap-8"
        >
          {/* Inputs row */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Destination */}
            <div className="flex flex-col gap-2">
              <label className="text-[10px] font-bold text-[#8888AA] tracking-[2px] uppercase">
                Destination
              </label>
              <input
                type="text"
                placeholder="Where do you want to go?"
                value={form.destination}
                onChange={(e) => setForm({ ...form, destination: e.target.value })}
                className="h-[52px] bg-[#0A0A1A] border border-white/10 rounded-xl px-4 text-[15px] text-white placeholder-white/30 focus:outline-none focus:border-[#4F6EF7]/60 transition-colors"
              />
            </div>

            {/* Dates */}
            <div className="flex flex-col gap-2">
              <label className="text-[10px] font-bold text-[#8888AA] tracking-[2px] uppercase">
                Travel Dates
              </label>
              <input
                type="text"
                placeholder="When are you going?"
                value={form.dates}
                onChange={(e) => setForm({ ...form, dates: e.target.value })}
                className="h-[52px] bg-[#0A0A1A] border border-white/10 rounded-xl px-4 text-[15px] text-white placeholder-white/30 focus:outline-none focus:border-[#4F6EF7]/60 transition-colors"
              />
            </div>

            {/* Budget */}
            <div className="flex flex-col gap-2">
              <label className="text-[10px] font-bold text-[#8888AA] tracking-[2px] uppercase">
                Budget
              </label>
              <input
                type="text"
                placeholder="Your total budget"
                value={form.budget}
                onChange={(e) => setForm({ ...form, budget: e.target.value })}
                className="h-[52px] bg-[#0A0A1A] border border-white/10 rounded-xl px-4 text-[15px] text-white placeholder-white/30 focus:outline-none focus:border-[#4F6EF7]/60 transition-colors"
              />
            </div>

            {/* Travelers */}
            <div className="flex flex-col gap-2">
              <label className="text-[10px] font-bold text-[#8888AA] tracking-[2px] uppercase">
                Travelers
              </label>
              <input
                type="text"
                placeholder="How many people?"
                value={form.travelers}
                onChange={(e) => setForm({ ...form, travelers: e.target.value })}
                className="h-[52px] bg-[#0A0A1A] border border-white/10 rounded-xl px-4 text-[15px] text-white placeholder-white/30 focus:outline-none focus:border-[#4F6EF7]/60 transition-colors"
              />
            </div>
          </div>

          {/* Travel Style */}
          <div className="flex flex-col gap-3">
            <label className="text-[10px] font-bold text-[#8888AA] tracking-[2px] uppercase">
              Travel Style
            </label>
            <div className="flex flex-wrap gap-3">
              {STYLE_OPTIONS.map(({ emoji, label }) => {
                const active = selectedStyles.includes(label);
                return (
                  <button
                    key={label}
                    type="button"
                    onClick={() => toggleStyle(label)}
                    className={`flex items-center gap-2 px-5 py-2.5 rounded-full text-[13px] font-semibold transition-all duration-200 ${
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
            className="w-full h-16 bg-[#4F6EF7] hover:bg-[#3B5BDB] text-white font-bold text-lg rounded-xl transition-all duration-200 shadow-lg shadow-[#4F6EF740] hover:shadow-[#4F6EF770] flex items-center justify-center gap-3 cursor-pointer"
          >
            {submitted ? (
              <>
                <span>🎉</span>
                <span>Coming soon — backend in progress!</span>
              </>
            ) : (
              <>
                <span>✨</span>
                <span>Generate My Perfect Itinerary</span>
              </>
            )}
          </button>

          {submitted && (
            <p className="text-center text-sm text-[#8888AA]">
              The AI trip generator will be live once we connect the FastAPI backend.
              Stay tuned!
            </p>
          )}
        </form>
      </div>
    </section>
  );
}
