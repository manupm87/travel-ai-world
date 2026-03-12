import React from "react";
import { Trip } from "@/types/trip";

interface JourneyMapProps {
  trip: Trip;
}

export default function JourneyMap({ trip }: JourneyMapProps) {
  return (
    <section className="w-full bg-transparent px-8 md:px-16 lg:px-[120px] pb-10 flex flex-col gap-5">
      <h2 className="text-[#4F6EF7] text-[10px] font-bold tracking-[2.5px] uppercase">
        Route Overview
      </h2>
      
      <div className="bg-[#13132A] rounded-[20px] p-6 md:p-10 border border-white/5 flex flex-col items-center justify-center min-h-[250px] relative overflow-hidden">
        {/* Simplified conceptual map with connecting lines */}
        <div className="flex flex-col md:flex-row items-center justify-between w-full max-w-4xl relative z-10 gap-12 md:gap-4">
          
          {/* Connecting line background */}
          <div className="hidden md:block absolute top-[40%] left-[10%] right-[10%] h-0.5 bg-white/10 -z-10"></div>
          
          {trip.destinations.map((dest, i) => (
            <div key={dest.id} className="flex flex-col items-center gap-3 relative">
              <div className="w-4 h-4 rounded-full bg-[#4F6EF7] border-[3px] border-[#13132A] relative z-10 shadow-[0_0_15px_rgba(79,110,247,0.5)]"></div>
              
              <div className="bg-[#1A1A2E] border border-white/10 rounded-xl p-3 flex flex-col items-center gap-1 min-w-[120px]">
                <span className="text-2xl">{dest.countryCode === 'FR' ? '🇫🇷' : dest.countryCode === 'IT' ? '🇮🇹' : '🇪🇸'}</span>
                <span className="text-white font-bold">{dest.city}</span>
                <span className="text-[#8888AA] text-xs text-center">{dest.nightsStaying} Nights</span>
              </div>
              
              {/* Connecting line for mobile */}
              {i < trip.destinations.length - 1 && (
                <div className="md:hidden absolute top-[100%] h-12 w-0.5 bg-white/10 -z-10 mt-[2px]"></div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
