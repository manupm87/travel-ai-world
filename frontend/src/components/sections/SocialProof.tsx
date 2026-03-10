const STATS = [
  { value: "50,000+", label: "Trips Generated" },
  { value: "190+", label: "Destinations Covered" },
  { value: "4.9★", label: "Average Rating" },
  { value: "30s", label: "Average Plan Time" },
];

const TESTIMONIALS = [
  {
    stars: 5,
    quote:
      "I planned a 2-week Japan trip in under 5 minutes. The AI even found a cherry blossom festival I didn't know about. Absolutely magical.",
    author: "Sofia M.",
    location: "Madrid 🇪🇸",
    highlight: false,
  },
  {
    stars: 5,
    quote:
      "We had a tight budget for our honeymoon. Travel AI World found an incredible Santorini package with everything optimized. We saved €800 vs booking manually.",
    author: "Luca & Emma",
    location: "Milan 🇮🇹",
    highlight: true,
  },
  {
    stars: 5,
    quote:
      "The day-by-day itinerary for our Costa Rica adventure was perfect. Every activity was close by, timing made sense. No wasted time, pure bliss.",
    author: "James K.",
    location: "London 🇬🇧",
    highlight: false,
  },
];

export default function SocialProof() {
  return (
    <section id="testimonials" className="bg-[#0A0A12] py-24 px-16">
      <div className="max-w-[1440px] mx-auto flex flex-col gap-16">
        {/* Header */}
        <p className="text-[#4F6EF7] text-[11px] font-bold tracking-[3px] uppercase">
          Loved by Travelers
        </p>

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
          {STATS.map((stat) => (
            <div
              key={stat.label}
              className="flex flex-col gap-2 p-8 rounded-2xl bg-[#13132A] border border-white/5"
            >
              <span className="text-[#4F6EF7] text-5xl font-bold tracking-[-2px]">
                {stat.value}
              </span>
              <span className="text-[#8888AA] text-sm">{stat.label}</span>
            </div>
          ))}
        </div>

        {/* Testimonials */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {TESTIMONIALS.map((t) => (
            <div
              key={t.author}
              className={`flex flex-col gap-4 p-8 rounded-2xl border ${
                t.highlight
                  ? "bg-[#4F6EF712] border-[#4F6EF730]"
                  : "bg-[#13132A] border-white/5"
              }`}
            >
              <span className="text-[#F5A623] text-base">
                {"★".repeat(t.stars)}
              </span>
              <p className="text-white text-[15px] leading-relaxed flex-1">
                &ldquo;{t.quote}&rdquo;
              </p>
              <div className="flex flex-col gap-0.5 pt-2 border-t border-white/5">
                <span className="text-white font-semibold text-sm">
                  {t.author}
                </span>
                <span className="text-[#8888AA] text-xs">{t.location}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
