import React from "react";
import Link from "next/link";
import { Trip } from "@/types/trip";

interface TripHeaderProps {
  trip: Trip;
}

export default function TripHeader({ trip }: TripHeaderProps) {
  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric"
    });
  };

  const calculateTravelers = () => {
    return trip.travelers.adults + trip.travelers.children + trip.travelers.infants;
  };

  const getStatusColor = (status: string) => {
    if (status === "planned" || status === "confirmed") return "text-green-500 bg-green-500/20";
    return "text-blue-500 bg-blue-500/20";
  };

  return (
    <section className="w-full bg-transparent px-8 md:px-16 lg:px-[120px] pt-[60px] pb-10 flex flex-col gap-8">
      {/* Header Top Row */}
      <div className="flex justify-between items-start flex-wrap gap-8">
        {/* Header Left */}
        <div className="flex flex-col gap-4">
          <Link
            href="/dashboard"
            className="flex items-center gap-2 bg-white/10 hover:bg-white/20 transition-colors px-4 py-2.5 rounded-lg w-fit"
          >
            <span className="text-white font-semibold">←</span>
            <span className="text-white/90 text-[13px]">Back to Dashboard</span>
          </Link>
          
          <h1 className="text-white text-5xl md:text-[48px] font-bold tracking-[-1.5px] leading-[1.1]">
            {trip.title}
          </h1>
          
          <div className="flex flex-wrap items-center gap-6 mt-2">
            <div className="flex items-center gap-2 text-[#8888AA]">
              <span>📅</span>
              <span className="text-sm">
                {formatDate(trip.dates.startDate)} - {formatDate(trip.dates.endDate)} ({trip.dates.durationDays} days)
              </span>
            </div>
            <div className="flex items-center gap-2 text-[#8888AA]">
              <span>👥</span>
              <span className="text-sm">{calculateTravelers()} Travelers</span>
            </div>
            <div className="flex items-center gap-2 text-[#8888AA]">
              <span>💰</span>
              <span className="text-sm">
                {new Intl.NumberFormat('en-US', { style: 'currency', currency: trip.budget.currency, maximumFractionDigits: 0 }).format(trip.budget.total)} Total Budget
              </span>
            </div>
          </div>
        </div>

        {/* Header Actions */}
        <div className="flex flex-col md:flex-row lg:flex-col gap-3 items-start md:items-end w-full lg:w-auto mt-4 lg:mt-0">
          <div className={`px-4 py-2 rounded-full flex items-center gap-2 ${getStatusColor(trip.status)}`}>
            <div className="w-1.5 h-1.5 rounded-full bg-current"></div>
            <span className="text-[11px] font-bold tracking-[1.5px] uppercase">{trip.status}</span>
          </div>
          
          <div className="flex gap-3 mt-1">
            <button className="flex items-center gap-2 bg-[#4F6EF7] hover:bg-[#3B5BDB] transition-colors px-5 py-3 rounded-lg text-white">
              <span>📋</span>
              <span className="text-sm font-semibold">View Bookings</span>
            </button>
            <button className="flex items-center gap-2 bg-white/10 hover:bg-white/20 transition-colors px-5 py-3 rounded-lg text-white">
              <span>📥</span>
              <span className="text-sm font-semibold text-white/90">Export PDF</span>
            </button>
          </div>
        </div>
      </div>

      {/* Budget Overview */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-4">
        <BudgetCard label="ACCOMMODATION" value={trip.budget.breakdown.accommodation} currency={trip.budget.currency} />
        <BudgetCard label="FOOD & DINING" value={trip.budget.breakdown.food} currency={trip.budget.currency} />
        <BudgetCard label="ACTIVITIES" value={trip.budget.breakdown.activities} currency={trip.budget.currency} />
        <BudgetCard label="TRANSPORT" value={trip.budget.breakdown.transportation} currency={trip.budget.currency} />
      </div>
    </section>
  );
}

function BudgetCard({ label, value, currency }: { label: string; value: number; currency: string }) {
  return (
    <div className="bg-[#13132A] rounded-xl p-5 flex flex-col gap-2 border border-white/5">
      <h3 className="text-[#8888AA] text-[9px] font-bold tracking-[2px]">{label}</h3>
      <p className="text-white text-[28px] font-bold tracking-[-1px]">
        {new Intl.NumberFormat('en-US', { style: 'currency', currency: currency, maximumFractionDigits: 0 }).format(value)}
      </p>
    </div>
  );
}
