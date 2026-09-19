import type { ItineraryDraft } from "@/hooks/plannerReducer";
import { DAY_PARTS, type DayPart, type Slot } from "@/types/planner";

/** The stay has no day of its own; this is the pseudo-slot `TripPanel` uses. */
const STAY_SLOT: Slot = { day: 0, part: null };

/**
 * One pin on the day map: a card of the itinerary that carries coordinates.
 *
 * `index` numbers the stops of the day, 1-based, in slot order
 * (morning → afternoon → evening → night) and, inside a slot, in the order the
 * cards are listed. The stay is not a stop of any day: it comes first, is
 * drawn as an "H" pin and keeps `index: 0`.
 */
export interface MapStop {
  /** Stable across renders: `stay:<cardId>` or `<day>:<part>:<cardId>`. */
  id: string;
  /** The slot the card sits in; {@link STAY_SLOT} (`day: 0`) for the stay. */
  slot: Slot;
  /** 1-based position within the day; `0` for the stay, which is unnumbered. */
  index: number;
  title: string;
  /** The part of the day, or `null` for the stay. */
  part: DayPart | null;
  lat: number;
  lon: number;
  kind: "stop" | "stay";
}

/** `[[minLon, minLat], [maxLon, maxLat]]`, the shape MapLibre's `fitBounds` takes. */
export type MapBounds = [[number, number], [number, number]];

/** The id `toMapStops` gives the itinerary's stay. */
export function stayStopId(cardId: string): string {
  return `stay:${cardId}`;
}

/** The id `toMapStops` gives one card of a day. */
export function stopId(day: number, part: DayPart, cardId: string): string {
  return `${day}:${part}:${cardId}`;
}

/**
 * The pins of one day, in the order the map draws them and the panel numbers
 * them: the stay (when it has coordinates), then the day's cards in slot order.
 * Cards without coordinates are skipped — they are not on the map and their
 * row in `DayCard` gets no number — and the numbering skips them too, so what
 * the panel shows and what the map shows always agree.
 *
 * Pure, so `TripMap` and `DayCard` can both derive their view from the same
 * call in `PlannerClientPage` instead of each walking the itinerary.
 */
export function toMapStops(itinerary: ItineraryDraft, selectedDay: number): MapStop[] {
  const stops: MapStop[] = [];

  const stay = itinerary.stay;
  if (stay && stay.lat !== null && stay.lon !== null) {
    stops.push({
      id: stayStopId(stay.id),
      slot: STAY_SLOT,
      index: 0,
      title: stay.title,
      part: null,
      lat: stay.lat,
      lon: stay.lon,
      kind: "stay",
    });
  }

  const day = itinerary.days.find((d) => d.day === selectedDay);
  if (!day) return stops;

  let index = 0;
  for (const part of DAY_PARTS) {
    for (const card of day.slots[part]) {
      if (card.lat === null || card.lon === null) continue;
      index += 1;
      stops.push({
        id: stopId(day.day, part, card.id),
        slot: { day: day.day, part },
        index,
        title: card.title,
        part,
        lat: card.lat,
        lon: card.lon,
        kind: "stop",
      });
    }
  }

  return stops;
}

/**
 * The box that holds every stop, or `null` when there is none. A single stop
 * gives a degenerate box; the map caps the resulting zoom instead of treating
 * that as a special case.
 */
export function boundsOf(stops: MapStop[]): MapBounds | null {
  const first = stops[0];
  if (!first) return null;

  let minLon = first.lon;
  let maxLon = first.lon;
  let minLat = first.lat;
  let maxLat = first.lat;

  for (const stop of stops) {
    if (stop.lon < minLon) minLon = stop.lon;
    if (stop.lon > maxLon) maxLon = stop.lon;
    if (stop.lat < minLat) minLat = stop.lat;
    if (stop.lat > maxLat) maxLat = stop.lat;
  }

  return [
    [minLon, minLat],
    [maxLon, maxLat],
  ];
}

/**
 * The `LineString` joining the day's stops in order — straight segments, no
 * routing (`RouteStrip` carries the real travel times). The stay is the start
 * of the line when it is on the map, so the day reads "out of the hotel and
 * round"; fewer than two points draw nothing.
 */
export function lineOf(stops: MapStop[]): GeoJSON.Feature<GeoJSON.LineString> | null {
  if (stops.length < 2) return null;
  return {
    type: "Feature",
    properties: {},
    geometry: {
      type: "LineString",
      coordinates: stops.map((stop) => [stop.lon, stop.lat]),
    },
  };
}
