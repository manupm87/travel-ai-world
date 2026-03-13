import React from "react";
import Image from "next/image";
import Link from "next/link";
import { TripSummary } from "@/types/trip-summary";

interface TripCardProps {
  trip: TripSummary;
}

const statusConfig = {
  planning: {
    label: "Planning",
    bgColor: "bg-[#F78E4F]/20",
    textColor: "text-[#F78E4F]",
  },
  planned: {
    label: "Planned",
    bgColor: "bg-[#4F6EF7]/20",
    textColor: "text-[#4F6EF7]",
  },
  finished: {
    label: "Finished",
    bgColor: "bg-[#2A2A35]",
    textColor: "text-[#888899]",
  },
};

export default function TripCard({ trip }: TripCardProps) {
  const config = statusConfig[trip.status];

  // Helper to format date display
  const formatDateRange = (start: string, end: string) => {
    // Basic formatting for the mock (expand dynamically as needed)
    return `${start} - ${end}`;
  };

  return (
    <Link href={`/trip/${trip.id}`} className="block group w-full max-w-[400px] md:max-w-none">
      <div className="flex flex-col rounded-2xl bg-[#1A1A24] border border-[#2A2A35] overflow-hidden transition-all duration-300 group-hover:border-[#4F6EF7] group-hover:-translate-y-1">
        {/* Cover Image Container */}
        <div className="relative w-full h-[200px] bg-[#2A2A35] overflow-hidden">
          <Image
            src={trip.imageUrl}
            alt={trip.title}
            fill
            className="object-cover transition-transform duration-500 group-hover:scale-105"
            sizes="(max-width: 400px) 100vw, 400px"
          />
        </div>

        {/* Content Container */}
        <div className="flex flex-col p-6 gap-4">
          <div className="flex items-center justify-between">
            <div className={`px-3 py-1 rounded-full text-xs font-bold ${config.bgColor} ${config.textColor}`}>
              {config.label}
            </div>
            <div className="text-xs font-bold text-[#888899]">
              {formatDateRange(trip.startDate, trip.endDate)}
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <h3 className="text-2xl font-bold text-white leading-tight">
              {trip.title}
            </h3>
            <p className="text-base text-[#888899]">
              {trip.destinations.join(", ")}
            </p>
          </div>
        </div>
      </div>
    </Link>
  );
}
