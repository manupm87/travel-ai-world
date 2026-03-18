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
          <h2 className="text-4xl lg:text-5xl font-medium text-text-primary tracking-[-1px] leading-tight">
            {p.title}
          </h2>
        </div>

{/* PROMPT MODE — replacing the old form */}
<div className="bg-bg-card border border-border rounded-2xl p-8 lg:p-12 flex flex-col gap-6">

  {/* Label */}
  <label className="text-[12px] font-medium text-text-secondary tracking-[0.1em] uppercase">
    Escribe tu viaje
  </label>

  {/* Textarea */}
  <textarea
    value={form.destination}
    onChange={(e) => setForm({ ...form, destination: e.target.value })}
    placeholder="Crea un itinerario de 7 días en París o Japon para una escapada de ensueño!!!"
    className="w-full h-40 bg-bg-primary border border-border-soft rounded-xl p-4 text-[15px] text-text-primary placeholder-text-secondary/50 focus:outline-none focus:border-accent/60 transition-colors"
  />

{/* Category quick actions — centrados */}
<div className="flex flex-wrap justify-center gap-3 mt-2">

  {[
    { label: "Vuelos", icon: "✈️" },
    { label: "Hoteles", icon: "🏨" },
    { label: "Restaurantes", icon: "🍽️" },
    { label: "Atracciones", icon: "🎡" },
  ].map(({ label, icon }) => (
    <button
      key={label}
      type="button"
      className="flex items-center gap-2 px-5 py-2 bg-bg-secondary hover:bg-bg-card border border-border-soft text-text-primary rounded-xl text-sm font-medium transition-all"
    >
      <span>{icon}</span>
      {label}
    </button>
  ))}

</div>


  {/* Main button */}
  <button
    type="button"
    onClick={() => {
      setSubmitted(true);
      setTimeout(() => setSubmitted(false), 4000);
    }}
    className="w-full h-16 bg-accent hover:bg-accent-hover text-white font-medium text-lg rounded-xl transition-all duration-300 shadow-lg shadow-accent/40 flex items-center justify-center gap-3 active:scale-[0.98]"
  >
    <span>✨</span>
    <span>Planificar viaje</span>
  </button>

  {/* Temporary message */}
  {submitted && (
    <p className="text-center text-sm text-text-secondary">
      Estamos trabajando en ello. ¡Próximamente tendremos más avances!
    </p>
  )}

{/* Bottom action bar — izquierda y derecha */}
<div className="flex items-center justify-between mt-4 border border-border-soft bg-bg-primary rounded-xl px-4 py-3">

  {/* Left: Attach */}
  <button
    type="button"
    className="text-text-secondary hover:text-text-primary transition text-xl"
  >
    📎
  </button>

  {/* Right: Microphone */}
  <button
    type="button"
    className="text-text-secondary hover:text-text-primary transition text-xl"
  >
    🎤
  </button>

</div>


</div>

      </div>
    </section>
  );
}
