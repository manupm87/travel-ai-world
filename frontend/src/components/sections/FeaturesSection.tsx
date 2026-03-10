const FEATURES = [
  {
    emoji: "🧠",
    title: "Hyper-Personalized AI",
    description:
      "Learns your preferences to suggest experiences that genuinely match your style — not just tourist traps.",
    highlight: false,
  },
  {
    emoji: "📅",
    title: "Day-by-Day Itineraries",
    description:
      "Detailed schedules, timings, and logistics for every day of your trip — optimized for minimum travel, maximum fun.",
    highlight: false,
  },
  {
    emoji: "💰",
    title: "Smart Budget Control",
    description:
      "Set your budget and watch the AI optimize every recommendation — from hotels to restaurants — to your spending limit.",
    highlight: true,
  },
  {
    emoji: "🗺️",
    title: "Interactive Maps",
    description:
      "Visual maps showing your entire route, hotel locations, and must-see attractions at a glance.",
    highlight: false,
  },
  {
    emoji: "🍽️",
    title: "Local Foodie Guide",
    description:
      "Hand-picked restaurant recommendations for every meal, filtered by cuisine, budget, and location.",
    highlight: false,
  },
  {
    emoji: "✏️",
    title: "Fully Customizable",
    description:
      "Not happy with a suggestion? Edit, swap, or regenerate any part of your itinerary with a single click.",
    highlight: false,
  },
];

export default function FeaturesSection() {
  return (
    <section id="features" className="bg-[#0E0E1A] py-24 px-16">
      <div className="max-w-[1440px] mx-auto flex flex-col gap-16">
        {/* Header */}
        <div className="flex flex-col gap-4">
          <p className="text-[#4F6EF7] text-[11px] font-bold tracking-[3px] uppercase">
            Why Choose Travel AI World
          </p>
          <h2 className="text-5xl xl:text-[56px] font-bold text-white tracking-[-1.5px] leading-tight">
            Smarter planning,
            <br />
            more memorable moments.
          </h2>
        </div>

        {/* Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {FEATURES.map((feat) => (
            <div
              key={feat.title}
              className={`flex flex-col gap-4 p-8 rounded-2xl border transition-all hover:scale-[1.01] ${
                feat.highlight
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
