import Image from "next/image";

const STEPS = [
  {
    number: "1",
    title: "Tell Us Your Dreams",
    description:
      "Enter your destination, travel dates, budget, group size, and travel vibe. Takes less than 60 seconds.",
    image: "https://images.unsplash.com/photo-1488646953014-85cb44e25828?w=600&q=80",
    alt: "Person planning a trip on laptop",
    active: true,
  },
  {
    number: "2",
    title: "AI Builds Your Itinerary",
    description:
      "Our AI analyzes thousands of options, reviews, and local insights to craft a day-by-day personalized itinerary.",
    image: "https://images.unsplash.com/photo-1677442135703-1787eea5ce01?w=600&q=80",
    alt: "AI generating a travel plan",
    active: false,
  },
  {
    number: "3",
    title: "Live the Experience",
    description:
      "Download your itinerary, book directly, or let us handle reservations. Your adventure begins with one click.",
    image: "https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?w=600&q=80",
    alt: "Happy couple traveling with suitcases",
    active: false,
  },
];

export default function HowItWorks() {
  return (
    <section id="how-it-works" className="bg-[#0A0A12] py-24 px-16">
      <div className="max-w-[1440px] mx-auto flex flex-col gap-16">
        {/* Header */}
        <div className="flex flex-col gap-4">
          <p className="text-[#4F6EF7] text-[11px] font-bold tracking-[3px] uppercase">
            How It Works
          </p>
          <h2 className="text-5xl xl:text-[56px] font-bold text-white tracking-[-1.5px] leading-tight">
            Three steps to your
            <br />
            perfect getaway.
          </h2>
        </div>

        {/* Steps */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {STEPS.map((step) => (
            <div
              key={step.number}
              className={`flex flex-col gap-5 p-8 rounded-2xl border transition-all ${
                step.active
                  ? "bg-[#13132A] border-[#4F6EF730]"
                  : "bg-[#13132A] border-white/5"
              }`}
            >
              {/* Step number */}
              <div
                className={`w-11 h-11 rounded-full flex items-center justify-center text-lg font-bold text-white ${
                  step.active ? "bg-[#4F6EF7]" : "bg-white/10"
                }`}
              >
                {step.number}
              </div>

              {/* Image */}
              <div className="relative w-full h-[180px] rounded-xl overflow-hidden">
                <Image
                  src={step.image}
                  alt={step.alt}
                  fill
                  className="object-cover"
                  sizes="(max-width: 768px) 100vw, 33vw"
                />
              </div>

              {/* Content */}
              <h3 className="text-xl font-bold text-white">{step.title}</h3>
              <p className="text-sm text-[#8888AA] leading-relaxed">
                {step.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
