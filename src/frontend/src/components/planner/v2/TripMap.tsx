"use client";

import dynamic from "next/dynamic";
import { MapPin } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { interpolate } from "@/i18n";
import type { MapStop } from "./mapStops";

/** While the map chunk is being fetched, and before it can be. */
function MapSkeleton() {
  const { t } = useLanguage();
  return (
    <div
      role="status"
      className="flex h-full w-full items-center justify-center bg-bg-surface text-xs text-text-secondary"
    >
      {t.plan.map.loading}
    </div>
  );
}

/**
 * MapLibre needs `window` (and pulls ~200 kB of its own), so the canvas is
 * fetched in the browser only, and only by this page: the static export has no
 * server to render it on and the landing bundle never sees it.
 */
const TripMapCanvas = dynamic(
  () => import("./TripMapCanvas").then((module) => module.TripMapCanvas),
  { ssr: false, loading: () => <MapSkeleton /> }
);

export interface TripMapProps {
  /** The pins of the selected day, in order (`toMapStops`). */
  stops: MapStop[];
  /** The day being shown; it names the region for assistive technology. */
  selectedDay: number;
  /** `[latitude, longitude]` of the destination, or `null` when unknown. */
  centre: [number, number] | null;
  selectedStopId: string | null;
  onSelectStop: (id: string | null) => void;
}

/**
 * The planner's map pane: the selected day, pinned. A region of its own, so the
 * page reads as chat / trip / map at every width; the MapLibre instance is the
 * client-only chunk inside it, and this wrapper owns what surrounds it — the
 * accessible name and the overlay for a day with nothing to pin yet.
 */
export function TripMap({
  stops,
  selectedDay,
  centre,
  selectedStopId,
  onSelectStop,
}: TripMapProps) {
  const { t } = useLanguage();

  return (
    <section
      aria-label={interpolate(t.plan.map.region, { day: selectedDay })}
      className="relative h-full w-full overflow-hidden bg-bg-surface"
    >
      <TripMapCanvas
        stops={stops}
        centre={centre}
        selectedStopId={selectedStopId}
        onSelectStop={onSelectStop}
      />

      {stops.length === 0 && (
        <p className="pointer-events-none absolute inset-x-4 top-4 flex items-start gap-2 rounded-xl border border-border bg-bg-card/90 px-3 py-2 text-xs leading-snug text-text-secondary shadow-accent-glow">
          <MapPin size={12} aria-hidden="true" className="mt-0.5 shrink-0 text-accent" />
          <span>{t.plan.map.empty}</span>
        </p>
      )}
    </section>
  );
}
