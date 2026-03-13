import React from "react";
import { Trip } from "@/types/trip";

interface TripOverviewProps {
  trip: Trip;
}

export default function TripOverview({ trip }: TripOverviewProps) {
  return (
    <section className="w-full bg-[#0E0E1A] pb-10">
      <div className="max-w-[1440px] w-full mx-auto px-8 lg:px-16 flex flex-col gap-5">
        <h2 className="text-[#4F6EF7] text-[10px] font-bold tracking-[2.5px] uppercase">
          Trip Overview
        </h2>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Accommodations Card */}
          <div className="bg-[#13132A] rounded-2xl p-6 flex flex-col gap-4 border border-white/5">
            <div className="flex items-center gap-3 pb-3 border-b border-white/10">
              <span className="text-2xl">🏨</span>
              <h3 className="text-white text-lg font-bold">Accommodations</h3>
            </div>
            
            <div className="flex flex-col gap-4">
              {trip.accommodation.map(acc => (
                <div key={acc.id} className="flex flex-col gap-1">
                  <div className="flex justify-between items-start">
                    <span className="text-white font-semibold">{acc.name}</span>
                    <span className="text-white/80 text-sm">{acc.rating} ★</span>
                  </div>
                  <span className="text-[#8888AA] text-sm">{acc.city}, {acc.countryCode}</span>
                  <span className="text-[#8888AA] text-xs">
                    {new Date(acc.checkIn).toLocaleDateString("en-US", { month: "short", day: "numeric" })} - {new Date(acc.checkOut).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Transportation Card */}
          <div className="bg-[#13132A] rounded-2xl p-6 flex flex-col gap-4 border border-white/5">
            <div className="flex items-center gap-3 pb-3 border-b border-white/10">
              <span className="text-2xl">✈️</span>
              <h3 className="text-white text-lg font-bold">Transportation</h3>
            </div>
            
            <div className="flex flex-col gap-4">
              {trip.transportation.map(trans => (
                <div key={trans.id} className="flex flex-col gap-1">
                  <div className="flex justify-between items-start">
                    <span className="text-white font-semibold">{trans.fromCity} → {trans.toCity}</span>
                    <span className="bg-white/10 text-white/90 text-[10px] px-2 py-0.5 rounded capitalize">{trans.type}</span>
                  </div>
                  <span className="text-[#8888AA] text-sm">{trans.provider} {trans.flightNumber && `• ${trans.flightNumber}`}</span>
                  <span className="text-[#8888AA] text-xs text-capitalize">
                    {trans.departureTime} - {trans.arrivalTime} ({Math.floor(trans.duration / 60)}h {trans.duration % 60}m)
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
