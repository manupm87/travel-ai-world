"use client";

/** The trip map, loaded on demand. */

import dynamic from "next/dynamic";
import { MapPin } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { interpolate } from "@/i18n";
import type { MapStop, OptionMark } from "./mapStops";

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
 * MapLibre needs `window` and weighs ~200 kB, so the canvas is a client-only
 * chunk loaded by this page alone; the landing bundle never sees it.
 */
const TripMapCanvas = dynamic(
  () => import("./TripMapCanvas").then((module) => module.TripMapCanvas),
  { ssr: false, loading: () => <MapSkeleton /> }
);

export interface TripMapProps {
  /** The pins of the selected day, in order (`toMapStops`). */
  stops: MapStop[];
  /** The day shown, which names the region; `null` is the overview, centred on the city with no pins. */
  selectedDay: number | null;
  /** `[latitude, longitude]` of the destination, or `null` when unknown. */
  centre: [number, number] | null;
  selectedStopId: string | null;
  onSelectStop: (id: string | null) => void;
  /** The options Kiri is proposing, drawn as dashed marks. */
  options?: OptionMark[];
}

/**
 * The map behind the trip, as a region of its own: the selected day's pins, or
 * the city on the overview. It owns the accessible name and the note for a day
 * with nothing to pin; the MapLibre canvas inside it is client-only.
 */
export function TripMap({
  stops,
  selectedDay,
  centre,
  selectedStopId,
  onSelectStop,
  options,
}: TripMapProps) {
  const { t } = useLanguage();

  return (
    <section
      aria-label={
        selectedDay === null
          ? t.plan.map.regionTrip
          : interpolate(t.plan.map.region, { day: selectedDay })
      }
      className="relative h-full w-full overflow-hidden bg-bg-surface"
    >
      <TripMapCanvas
        stops={stops}
        centre={centre}
        selectedStopId={selectedStopId}
        onSelectStop={onSelectStop}
        options={options}
      />

      {selectedDay !== null && stops.length === 0 && (
        <p className="pointer-events-none absolute top-4 right-4 flex max-w-72 items-start gap-2 rounded-xl border border-glass-border bg-glass-bg px-3 py-2 text-xs leading-snug text-text-secondary backdrop-blur-xl">
          <MapPin size={12} aria-hidden="true" className="mt-0.5 shrink-0 text-accent" />
          <span>{t.plan.map.empty}</span>
        </p>
      )}
    </section>
  );
}
