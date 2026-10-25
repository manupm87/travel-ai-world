/** The map's pins and bounds, from the itinerary. */

import type { ItineraryDraft, OptionGroupState } from "@/hooks/plannerReducer";
import { DAY_PARTS, type DayPart, type Slot } from "@/types/planner";

/** The stay has no day of its own; this is the pseudo-slot `TripPanel` uses. */
const STAY_SLOT: Slot = { day: 0, part: null };

/**
 * One pin on the day map: a card of the itinerary that carries coordinates.
 * The stay belongs to no day: it comes first, is drawn as an "H" and keeps `index: 0`.
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

/** What a pin shows, on the map and beside its card: the stop's number, or "H" for the stay. */
export function stopGlyph(stop: MapStop): string {
  return stop.kind === "stay" ? "H" : String(stop.index);
}

/**
 * The pins of one day: the stay, then the day's cards in slot order. Cards without
 * coordinates are skipped and not numbered, so the panel and the map agree.
 * `selectedDay: null` is the overview, which pins nothing, not even the stay.
 */
export function toMapStops(
  itinerary: ItineraryDraft,
  selectedDay: number | null
): MapStop[] {
  if (selectedDay === null) return [];

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

/** An option Kiri is proposing, drawn as a dashed mark beside the day's pins. */
export interface OptionMark {
  /** `option:<groupId>:<cardId>`. */
  id: string;
  title: string;
  lat: number;
  lon: number;
}

/** Kinds of group whose cards are places worth marking on a city map. */
const MARKABLE = new Set<OptionGroupState["kind"]>([
  "neighbourhood",
  "hotel",
  "experience",
  "restaurant",
]);

/** The newest pending question's options that have coordinates and were not dismissed. */
export function toOptionMarks(
  groups: Record<string, OptionGroupState>,
  pendingGroupIds: string[]
): OptionMark[] {
  for (let i = pendingGroupIds.length - 1; i >= 0; i -= 1) {
    const group = groups[pendingGroupIds[i] ?? ""];
    if (!group || !MARKABLE.has(group.kind)) continue;
    const marks = group.cards
      .filter((card) => !group.dismissedIds.includes(card.id))
      .flatMap((card) =>
        card.lat === null || card.lon === null
          ? []
          : [{ id: `option:${group.group_id}:${card.id}`, title: card.title, lat: card.lat, lon: card.lon }]
      );
    if (marks.length > 0) return marks;
  }
  return [];
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
 * The `LineString` joining the day's stops in order: straight segments, no routing
 * (`RouteStrip` carries the travel times). Fewer than two points draw nothing.
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
