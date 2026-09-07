"use client";

import React from "react";
import Image from "next/image";
import Link from "next/link";
import { useLanguage } from "@/context/LanguageContext";
import type { TripStatus, TripSummary } from "@/types/trip-summary";

interface TripCardProps {
  trip: TripSummary;
}

/** Badge colours per status; the label comes from `t.status`. */
const STATUS_STYLES: Record<TripStatus, string> = {
  planning: "bg-status-planning/20 text-status-planning",
  planned: "bg-accent/20 text-accent",
  finished: "bg-border-card text-text-secondary",
};

/**
 * Trip Summary Card.
 *
 * Renders a high-level preview of a Trip for lists/grids. Displays the trip's
 * cover image, status (Planning/Planned/Finished), dates, title, and destinations.
 *
 * Includes built-in hover states and links directly to the full Trip Viewer route.
 *
 * @param trip - The TripSummary object containing preview data.
 */
export default function TripCard({ trip }: TripCardProps) {
  const { t } = useLanguage();

  // Helper to format date display
  const formatDateRange = (start: string, end: string) => {
    // Basic formatting for the mock (expand dynamically as needed)
    return `${start} - ${end}`;
  };

  return (
    <Link href={`/trip/${trip.id}`} className="block group w-full max-w-[400px] md:max-w-none">
      <div className="flex flex-col rounded-2xl bg-bg-surface border border-border-card overflow-hidden transition-all duration-300 group-hover:border-accent group-hover:-translate-y-1">
        {/* Cover Image Container */}
        <div className="relative w-full h-[200px] bg-border-card overflow-hidden">
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
            <div
              data-status={trip.status}
              className={`px-3 py-1 rounded-full text-xs font-medium ${STATUS_STYLES[trip.status]}`}
            >
              {t.status[trip.status]}
            </div>
            <div className="text-xs font-medium text-text-secondary">
              {formatDateRange(trip.startDate, trip.endDate)}
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <h3 className="text-2xl font-medium text-text-primary leading-tight">
              {trip.title}
            </h3>
            <p className="text-base text-text-secondary">
              {trip.destinations.join(", ")}
            </p>
          </div>
        </div>
      </div>
    </Link>
  );
}
