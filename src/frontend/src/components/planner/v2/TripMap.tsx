"use client";

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
  /**
   * The day being shown; it names the region for assistive technology. `null`
   * is the whole-trip overview (TRA-238): the map stays behind the trip,
   * centred on the city, with no day's pins on it.
   */
  selectedDay: number | null;
  /** `[latitude, longitude]` of the destination, or `null` when unknown. */
  centre: [number, number] | null;
  selectedStopId: string | null;
  onSelectStop: (id: string | null) => void;
  /** The options Kiri is proposing, drawn as dashed marks (TRA-238). */
  options?: OptionMark[];
}

/**
 * The map behind the trip (TRA-238): the selected day, pinned, or the city on
 * the whole-trip overview. A region of its own, so the page reads as chat,
 * trip and map; the MapLibre instance is the client-only chunk inside it, and
 * this wrapper owns what surrounds it — the accessible name and the note for a
 * day with nothing to pin yet.
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
