"use client";

import React, { useState } from "react";
import { Navigation } from "lucide-react";
import { Section } from "@/components/ui/Section";
import { Card } from "@/components/ui/Card";
import { Trip } from "@/types/trip";
import { getFlag } from "@/utils/countryFlag";
import { useFormatters } from "@/hooks/useFormatters";
import { useLanguage } from "@/context/LanguageContext";

interface InteractiveTimelineProps {
  trip: Trip;
}

/**
 * The route, as a line of stops (`trip-viewer`).
 *
 * Every destination is a node on one line; pressing one moves the panel below
 * it to that city. The line is the information — how many stops there are and
 * in which order — so it keeps its structure and loses only the eyebrow that
 * was repeating the heading (TRA-193).
 *
 * @param trip - The complete Trip data object.
 */
export default function InteractiveTimeline({ trip }: InteractiveTimelineProps) {
  const { t } = useLanguage();
  const { formatDate } = useFormatters();
  const [activeDest, setActiveDest] = useState<string>(trip.destinations[0]?.id || "");

  const activeDestData = trip.destinations.find((d) => d.id === activeDest);

  return (
    <Section variant="transparent" padding="medium">
      <div className="flex flex-col gap-6">
        <h2 className="text-2xl font-light text-text-primary">
          {t.tripViewer.routeOverview}
        </h2>

        <Card
          variant="glass"
          className="relative flex flex-col gap-10 overflow-hidden rounded-[24px] p-6 md:p-10"
        >
          {/* Timeline Visualizer */}
          <div className="relative z-10 flex w-full flex-col items-center justify-between gap-12 py-4 md:flex-row md:gap-4">
            {/* Horizontal Line (Desktop) */}
            <div className="absolute top-[28px] right-[5%] left-[5%] -z-10 hidden h-[2px] bg-border-soft md:block">
              <div
                className="h-full bg-accent shadow-accent-glow transition-all duration-500"
                style={{
                  width: `${(trip.destinations.findIndex((d) => d.id === activeDest) / (trip.destinations.length - 1)) * 100}%`,
                }}
              />
            </div>

            {trip.destinations.map((dest, i) => {
              const isActive = activeDest === dest.id;
              return (
                <div
                  key={dest.id}
                  className="relative flex w-full flex-col items-center gap-4 md:w-auto"
                >
                  <button
                    type="button"
                    onClick={() => setActiveDest(dest.id)}
                    aria-pressed={isActive}
                    className={`z-10 flex h-14 w-14 items-center justify-center rounded-full border-4 transition-all duration-300 focus-visible:ring-2 focus-visible:ring-accent/50 focus-visible:outline-none ${
                      isActive
                        ? "scale-110 border-accent/40 bg-accent shadow-accent-glow"
                        : "border-border bg-bg-card hover:border-accent"
                    }`}
                  >
                    <span className="text-2xl" role="img" aria-label={dest.city}>
                      {getFlag(dest.countryCode)}
                    </span>
                  </button>

                  <div className="flex flex-col items-center gap-0.5">
                    <span
                      className={`font-medium transition-colors ${isActive ? "text-accent" : "text-text-primary"}`}
                    >
                      {dest.city}
                    </span>
                    <span className="text-xs text-text-secondary">
                      {dest.nightsStaying} {t.tripViewer.nights.toLowerCase()}
                    </span>
                  </div>

                  {/* Vertical Line (Mobile) */}
                  {i < trip.destinations.length - 1 && (
                    <div className="absolute top-[56px] -z-10 h-12 w-[2px] bg-border-soft md:hidden" />
                  )}
                </div>
              );
            })}
          </div>

          {/* Active Destination Info Panel */}
          {activeDestData && (
            <div className="mt-4 animate-fade-in rounded-2xl border border-glass-border bg-glass-bg p-6">
              <div className="flex flex-col items-start justify-between gap-6 md:flex-row md:items-center">
                <div className="flex items-start gap-4">
                  <div className="rounded-xl bg-accent-soft p-3 text-accent">
                    <Navigation size={24} aria-hidden="true" />
                  </div>
                  <div className="flex flex-col">
                    <h3 className="text-xl font-medium text-text-primary">
                      {activeDestData.city}
                    </h3>
                    <p className="text-sm text-text-secondary">
                      {formatDate(activeDestData.arrivalDate, {
                        month: "long",
                        day: "numeric",
                      })}{" "}
                      –{" "}
                      {formatDate(activeDestData.departureDate, {
                        month: "long",
                        day: "numeric",
                      })}
                    </p>
                  </div>
                </div>

                <div className="flex items-stretch gap-3">
                  <div className="flex flex-col justify-center rounded-lg border border-glass-border px-4 py-2">
                    <span className="text-xs text-text-secondary">{t.tripViewer.nights}</span>
                    <span className="font-medium text-text-primary">
                      {activeDestData.nightsStaying}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const el = document.getElementById(`dest-${activeDestData.id}`);
                      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
                    }}
                    className="cursor-pointer rounded-lg bg-accent px-6 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover focus-visible:ring-2 focus-visible:ring-accent/50 focus-visible:outline-none"
                  >
                    {t.tripViewer.viewItinerary}
                  </button>
                </div>
              </div>
            </div>
          )}
        </Card>
      </div>
    </Section>
  );
}
