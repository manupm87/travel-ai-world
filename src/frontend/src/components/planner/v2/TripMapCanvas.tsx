"use client";

import { useEffect, useRef, useState } from "react";
import {
  Map as MapLibreMap,
  Marker,
  NavigationControl,
  type GeoJSONSource,
} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useLanguage } from "@/context/LanguageContext";
import { useTheme } from "@/context/ThemeContext";
import { interpolate } from "@/i18n";
import { boundsOf, lineOf, stopGlyph, type MapStop } from "./mapStops";

/**
 * OpenFreeMap's hosted OpenMapTiles styles (ADR 0016): no key, no quota, OSM
 * data, attribution added by MapLibre itself. One style per theme.
 */
export const STYLE_URLS = {
  light: "https://tiles.openfreemap.org/styles/positron",
  dark: "https://tiles.openfreemap.org/styles/dark",
} as const;

const LINE_SOURCE = "trip-day";
const LINE_LAYER = "trip-day-line";

/** Room for the markers and for the attribution when the day is fitted. */
const FIT_PADDING = { top: 48, right: 32, bottom: 40, left: 32 };
/** A day with a single stop must not end up at street level. */
const MAX_FIT_ZOOM = 15;
/** Close enough to read the streets around the stop that was opened. */
const SELECTED_ZOOM = 15;
/** Used with the city centre, before any stop has coordinates. */
const CITY_ZOOM = 12;

/**
 * The value of `--color-accent`. The line is painted on a canvas, so it cannot
 * carry a Tailwind class: the token is read from the document, and this is what
 * it holds for the environments where no stylesheet has applied yet (jsdom).
 */
const ACCENT_FALLBACK = "#4F6EF7";

export interface TripMapCanvasProps {
  /** The pins of the selected day, in order (`toMapStops`). */
  stops: MapStop[];
  /** `[latitude, longitude]` of the destination, or `null` when unknown. */
  centre: [number, number] | null;
  selectedStopId: string | null;
  onSelectStop: (id: string | null) => void;
}

function reducedMotion(): boolean {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
}

function accentColour(): string {
  const value = window
    .getComputedStyle(document.documentElement)
    .getPropertyValue("--color-accent")
    .trim();
  return value || ACCENT_FALLBACK;
}

/**
 * The marker's DOM: a wrapper for MapLibre and a button for us.
 *
 * The wrapper is what MapLibre gets, because it writes `style.transform` on the
 * element it is handed to place it — an inline style that would beat any
 * `scale` class and make a CSS transition fire on every pan. The button inside
 * is therefore free to grow when it is selected. It carries the theme tokens,
 * the stop id (for the panel and the tests) and the number the itinerary shows
 * beside the same card.
 */
function markerElement(stop: MapStop, label: string): [HTMLElement, HTMLButtonElement] {
  const root = document.createElement("div");
  const button = document.createElement("button");
  button.type = "button";
  button.dataset.mapStop = stop.id;
  button.dataset.selected = "false";
  button.dataset.dimmed = "false";
  button.setAttribute("aria-label", label);
  button.textContent = stopGlyph(stop);
  button.className = [
    "flex h-7 w-7 cursor-pointer items-center justify-center rounded-full",
    "border-2 border-bg-card text-xs font-semibold text-white shadow-accent-glow",
    "transition-transform duration-150 motion-reduce:transition-none",
    "hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60",
    "data-[selected=true]:scale-125 data-[dimmed=true]:opacity-40",
    stop.kind === "stay" ? "bg-gold" : "bg-accent",
  ].join(" ");
  root.append(button);
  return [root, button];
}

/** Adds, updates or drops the straight line through the day's stops. */
function drawLine(map: MapLibreMap, stops: MapStop[]): void {
  const line = lineOf(stops);

  const apply = () => {
    const source = map.getSource<GeoJSONSource>(LINE_SOURCE);
    if (!line) {
      if (map.getLayer(LINE_LAYER)) map.removeLayer(LINE_LAYER);
      if (source) map.removeSource(LINE_SOURCE);
      return;
    }
    if (source) {
      source.setData(line);
      return;
    }
    map.addSource(LINE_SOURCE, { type: "geojson", data: line });
    map.addLayer({
      id: LINE_LAYER,
      type: "line",
      source: LINE_SOURCE,
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": accentColour(),
        "line-width": 3,
        "line-opacity": 0.7,
        "line-dasharray": [2, 1.5],
      },
    });
  };

  // Without a style there is nowhere to put the source. `isStyleLoaded()` is
  // false whenever tiles or the sprite are in flight — not only before the
  // first render — so the wait has to be on an event that fires again:
  // `styledata` fires when a style finishes loading and after every
  // `setStyle`, while `load` fires once per map and is never replayed.
  if (map.isStyleLoaded()) apply();
  else map.once("styledata", apply);
}

/** The viewport that holds the whole day, or the city when it has no stop. */
function fitDay(map: MapLibreMap, stops: MapStop[], centre: [number, number] | null): void {
  const bounds = boundsOf(stops);
  if (bounds) {
    map.fitBounds(bounds, {
      padding: FIT_PADDING,
      maxZoom: MAX_FIT_ZOOM,
      animate: !reducedMotion(),
    });
  } else if (centre) {
    map.easeTo({
      center: [centre[1], centre[0]],
      zoom: CITY_ZOOM,
      animate: !reducedMotion(),
    });
  }
}

/**
 * The MapLibre instance: OpenFreeMap vector tiles, one numbered HTML marker per
 * stop of the selected day and a straight line joining them in order (the real
 * travel times stay in `RouteStrip`; nothing here routes). Reached only through
 * `TripMap`'s `next/dynamic` wrapper (`ssr: false`), because the library needs
 * `window` and the site is a static export.
 *
 * Everything is imperative, in effects keyed on the props. The markers are
 * added as soon as the map object exists and not in its `load` callback, so
 * they are on screen even when the tiles cannot be fetched (the e2e run blocks
 * them on purpose); the line needs the style, so it waits for it.
 */
export function TripMapCanvas({
  stops,
  centre,
  selectedStopId,
  onSelectStop,
}: TripMapCanvasProps) {
  const { t } = useLanguage();
  const { theme } = useTheme();
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  /** Per stop: the marker MapLibre positions and the button inside it. */
  const markersRef = useRef(new Map<string, { marker: Marker; button: HTMLButtonElement }>());
  /** MapLibre needs WebGL 2 and throws without it; the page must not go down. */
  const [unsupported, setUnsupported] = useState(false);

  // What a marker's click handler closes over must never go stale, and must
  // never be a reason to tear the markers down and build them again. The same
  // for the copy of the labels and for the stops the theme effect redraws.
  const onSelectRef = useRef(onSelectStop);
  const labelsRef = useRef(t.plan.map);
  const stopsRef = useRef(stops);
  /** The theme the current style was built for; `setStyle` follows it. */
  const styleThemeRef = useRef(theme);
  /** The stop the viewport was last moved for: only a change moves it again. */
  const selectedRef = useRef<string | null>(null);
  /** Read once, when the map is created: the first render's viewport. */
  const initialRef = useRef<{
    centre: [number, number] | null;
    stop: MapStop | null;
    theme: "light" | "dark";
  }>({ centre, stop: stops[0] ?? null, theme });

  // Declared first, so it has run before any effect below reads a ref.
  useEffect(() => {
    onSelectRef.current = onSelectStop;
    labelsRef.current = t.plan.map;
    stopsRef.current = stops;
  });

  // ── The map itself: created once, removed on unmount ──────────────────────
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const { centre: from, stop, theme: startTheme } = initialRef.current;
    const start: [number, number] | null = from
      ? [from[1], from[0]]
      : stop
        ? [stop.lon, stop.lat]
        : null;

    // MapLibre throws when the browser has no WebGL 2 (an old machine, a
    // disabled GPU, a headless run without SwiftShader). That must cost the
    // reader the map and nothing else, so it never reaches the error boundary.
    let map: MapLibreMap;
    try {
      map = new MapLibreMap({
        container,
        style: STYLE_URLS[startTheme],
        center: start ?? [0, 20],
        zoom: start ? CITY_ZOOM : 1,
        // The tiles are someone else's data: their credit stays readable.
        attributionControl: { compact: false },
      });
    } catch {
      // Not a synchronisation loop: this happens at most once per mount and
      // the component renders a message instead of a map from then on.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setUnsupported(true);
      return;
    }
    // MapLibre labels its own controls in English; the effect below rewrites
    // them in the reader's language, on mount and on every language change.
    map.addControl(new NavigationControl({ showCompass: false }), "top-right");
    mapRef.current = map;

    const markers = markersRef.current;
    return () => {
      for (const { marker } of markers.values()) marker.remove();
      markers.clear();
      map.remove();
      mapRef.current = null;
    };
    // Nothing in the deps: the map is created once. The style follows the theme
    // in its own effect, because re-creating it would throw the viewport away.
  }, []);

  // ── The theme: swap the style, then put the line back ─────────────────────
  useEffect(() => {
    const map = mapRef.current;
    const changed = styleThemeRef.current !== theme;
    styleThemeRef.current = theme;
    if (!map || !changed) return;
    map.setStyle(STYLE_URLS[theme]);
    // A new style drops every source and layer the app added; the markers are
    // DOM elements and survive it. `drawLine` waits for the new style itself.
    drawLine(map, stopsRef.current);
  }, [theme]);

  // ── The controls MapLibre labels itself, in the reader's language ──────────
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    for (const [selector, label] of [
      [".maplibregl-ctrl-zoom-in", t.plan.map.zoomIn],
      [".maplibregl-ctrl-zoom-out", t.plan.map.zoomOut],
    ] as const) {
      const button = container.querySelector(selector);
      if (!button) continue;
      button.setAttribute("aria-label", label);
      button.setAttribute("title", label);
    }
    // Keyed on the copy, not on the mount: the language switch lives in the
    // header and swaps `t` without remounting the planner.
  }, [t]);

  // ── The stops: markers, line, and a viewport that holds them ──────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const markers = markersRef.current;
    const wanted = new Set(stops.map((stop) => stop.id));
    for (const [id, entry] of markers) {
      if (wanted.has(id)) continue;
      entry.marker.remove();
      markers.delete(id);
    }

    for (const stop of stops) {
      const label =
        stop.kind === "stay"
          ? interpolate(labelsRef.current.stay, { title: stop.title })
          : interpolate(labelsRef.current.marker, { index: stop.index, title: stop.title });
      const existing = markers.get(stop.id);
      if (existing) {
        // A card's id survives the removal of an earlier card of the same day,
        // but its number does not: the glyph is rewritten with the label, or
        // the pin would keep a number the panel no longer shows.
        existing.button.textContent = stopGlyph(stop);
        existing.button.setAttribute("aria-label", label);
        existing.marker.setLngLat([stop.lon, stop.lat]);
        continue;
      }
      const [element, button] = markerElement(stop, label);
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        onSelectRef.current(stop.id);
      });
      markers.set(stop.id, {
        marker: new Marker({ element }).setLngLat([stop.lon, stop.lat]).addTo(map),
        button,
      });
    }

    drawLine(map, stops);

    fitDay(map, stops, centre);
  }, [stops, centre, t]);

  // ── The selection: the marker grows, the rest of the day steps back ───────
  useEffect(() => {
    // The pins are read back from the DOM rather than from `markersRef`: the
    // markers are the map's, and this effect only restyles what is on screen.
    const pins = containerRef.current?.querySelectorAll<HTMLElement>("[data-map-stop]") ?? [];
    const open = stops.find((stop) => stop.id === selectedStopId) ?? null;
    for (const pin of pins) {
      const selected = pin.dataset.mapStop === selectedStopId;
      pin.dataset.selected = selected ? "true" : "false";
      pin.dataset.dimmed = open && !selected ? "true" : "false";
      if (selected) pin.setAttribute("aria-current", "true");
      else pin.removeAttribute("aria-current");
    }

    // Opening an activity puts it in the middle of the map, close enough to
    // place it among its streets; closing one gives the whole day back. Never
    // a zoom out on the way in: a reader who came in closer keeps their zoom.
    // The viewport only moves when the selection itself changed — the effect
    // also runs when the day does, and that is the other effect's fit to make.
    const map = mapRef.current;
    const previous = selectedRef.current;
    selectedRef.current = selectedStopId;
    if (!map || previous === selectedStopId) return;
    if (open) {
      map.easeTo({
        center: [open.lon, open.lat],
        zoom: Math.max(map.getZoom(), SELECTED_ZOOM),
        animate: !reducedMotion(),
      });
    } else if (previous !== null) {
      fitDay(map, stops, centre);
    }
  }, [selectedStopId, stops, centre]);

  if (unsupported) {
    return (
      <p
        role="status"
        className="flex h-full w-full items-center justify-center p-4 text-center text-xs leading-snug text-text-secondary"
      >
        {t.plan.map.unsupported}
      </p>
    );
  }

  return (
    <div
      ref={containerRef}
      data-testid="trip-map-canvas"
      className="h-full w-full [&_.maplibregl-ctrl-attrib]:text-[10px]"
    />
  );
}
