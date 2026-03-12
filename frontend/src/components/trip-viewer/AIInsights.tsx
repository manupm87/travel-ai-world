import React from "react";
import { Trip } from "@/types/trip";

interface AIInsightsProps {
  trip: Trip;
}

export default function AIInsights({}: AIInsightsProps) {
  return (
    <section className="w-full bg-transparent px-8 md:px-16 lg:px-[120px] py-10 flex flex-col gap-6">
      <h2 className="text-[#4F6EF7] text-[11px] font-bold tracking-[3px] uppercase">
        AI Insights
      </h2>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Weather Card */}
        <div className="bg-[#4F6EF7]/[0.15] rounded-2xl p-6 flex items-start gap-4">
          <div className="text-4xl">🌤️</div>
          <div className="flex flex-col gap-2">
            <h3 className="text-white text-base font-bold">Weather Forecast</h3>
            <p className="text-[#8888AA] text-[13px] leading-relaxed">
              Perfect spring weather across all cities! Paris 18-22°C, Rome 20-25°C, Barcelona 19-24°C.
            </p>
          </div>
        </div>

        {/* Local Tips Card */}
        <div className="bg-[#13132A] border border-white/5 rounded-2xl p-6 flex items-start gap-4">
          <div className="text-4xl">💡</div>
          <div className="flex flex-col gap-2">
            <h3 className="text-white text-base font-bold">Local Tips</h3>
            <p className="text-[#8888AA] text-[13px] leading-relaxed">
              Buy a Paris Museum Pass for skip-the-line access. Book Colosseum tickets 2 weeks in advance.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
