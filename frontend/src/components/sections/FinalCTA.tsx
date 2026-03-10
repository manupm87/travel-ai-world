import Image from "next/image";
import Link from "next/link";

export default function FinalCTA() {
  return (
    <section className="bg-[#4F6EF7] py-24 px-16 relative overflow-hidden">
      {/* Background image */}
      <div className="absolute inset-0">
        <Image
          src="https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=1440&q=80"
          alt="Beautiful tropical beach at sunset"
          fill
          className="object-cover opacity-20"
          sizes="100vw"
        />
        <div className="absolute inset-0 bg-[#4F6EF7]/80" />
      </div>

      <div className="relative max-w-[1440px] mx-auto flex flex-col gap-8">
        <h2 className="text-6xl xl:text-[68px] font-bold text-white tracking-[-2px] leading-[1.0] max-w-3xl">
          Ready to explore the world?
        </h2>
        <p className="text-xl text-white/80 leading-relaxed max-w-[600px]">
          Join thousands of travelers who plan smarter. Your next adventure is
          just 30 seconds away.
        </p>
        <div className="flex flex-wrap gap-4">
          <Link
            href="#planner"
            className="bg-white hover:bg-white/90 transition-all duration-200 text-[#4F6EF7] font-bold text-lg px-10 py-[18px] rounded-xl shadow-xl"
          >
            Start Planning Free
          </Link>
          <button className="bg-white/10 hover:bg-white/20 border border-white/30 transition-all duration-200 text-white font-semibold text-lg px-10 py-[18px] rounded-xl">
            Watch Demo
          </button>
        </div>
      </div>
    </section>
  );
}
