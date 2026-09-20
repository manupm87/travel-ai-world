"use client";

import { Fragment } from "react";
import { useLanguage } from "@/context/LanguageContext";
import TripCard from "@/components/ui/TripCard";
import { cn } from "@/utils/cn";
import type { TripStatus, TripSummary } from "@/types/trip-summary";

export interface TripGridProps {
  trips: TripSummary[];
  /** The card on its way out: it collapses before `useTrips` drops it. */
  leavingId?: string | null;
  onEdit: (trip: TripSummary) => void;
  onDelete: (trip: TripSummary) => void;
}

/**
 * The order the groups read in: what is coming, what is being built, what has
 * already happened.
 */
const GROUP_ORDER = ["planned", "planning", "finished"] as const satisfies readonly TripStatus[];

/** The whole trip list settles in once, 40 ms apart, top-left to bottom-right. */
const STAGGER_MS = 40;

/**
 * Every trip in one grid.
 *
 * The three groups used to be three sections with their own background and
 * their own padding, which made a dashboard of four trips scroll like a
 * landing page. Now they are one grid and a group is a line across it: a quiet
 * heading and a rule spanning every column, with that group's cards flowing
 * underneath. The stagger counts across the whole list, not per group, so the
 * page settles in one movement.
 */
export function TripGrid({ trips, leavingId = null, onEdit, onDelete }: TripGridProps) {
  const { t } = useLanguage();

  const groups = GROUP_ORDER.map((status) => ({
    status,
    trips: trips.filter((trip) => trip.status === status),
  })).filter((group) => group.trips.length > 0);

  let position = 0;

  return (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
      {groups.map((group, groupIndex) => (
        <Fragment key={group.status}>
          <h3
            className={cn(
              "col-span-full flex items-center gap-4 text-sm font-medium text-text-secondary",
              groupIndex > 0 && "pt-4"
            )}
          >
            {t.dashboard.sections[group.status]}
            <span aria-hidden="true" className="h-px flex-1 bg-border" />
          </h3>
          {group.trips.map((trip) => {
            const leaving = trip.id === leavingId;
            const delay = position++ * STAGGER_MS;
            return (
              <div
                key={trip.id}
                data-leaving={leaving || undefined}
                className={cn(
                  "max-h-[280px] overflow-hidden transition-all duration-300",
                  leaving && "max-h-0 scale-[0.97] opacity-0"
                )}
              >
                <TripCard
                  trip={trip}
                  onEdit={() => onEdit(trip)}
                  onDelete={() => onDelete(trip)}
                  className="animate-fade-up"
                  style={{ animationDelay: `${delay}ms` }}
                />
              </div>
            );
          })}
        </Fragment>
      ))}
    </div>
  );
}
