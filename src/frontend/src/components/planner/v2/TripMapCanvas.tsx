"use client";

/** The MapLibre map behind the trip: pins, route line and camera. */

import { useEffect, useRef, useState } from "react";
import {
  Map as MapLibreMap,
  Marker,
  NavigationControl,
  setWorkerUrl,
  type GeoJSONSource,
} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useLanguage } from "@/context/LanguageContext";
import { useTheme } from "@/context/ThemeContext";
import { interpolate } from "@/i18n";
import { boundsOf, lineOf, stopGlyph, type MapStop, type OptionMark } from "./mapStops";

/**
 * OpenFreeMap's hosted OpenMapTiles styles (ADR 0016): no key, no quota, OSM
 * data, attribution added by MapLibre itself. One style per theme.
 */
export const STYLE_URLS = {
  light: "https://tiles.openfreemap.org/styles/positron",
  dark: "https://tiles.openfreemap.org/styles/dark",
} as const;

/**
 * MapLibre's worker, copied into `public/maplibre/` by `scripts/copy-maplibre-worker.mjs`:
 * under Turbopack MapLibre's `import.meta.url` lookup loads the page instead and the
 * map stays blank.
 */
export const WORKER_URL = "/maplibre/maplibre-gl-worker.js";

/** Told to MapLibre once per page, before the first map is built. */
let workerConfigured = false;

function configureWorker(): void {
  if (workerConfigured) return;
  setWorkerUrl(WORKER_URL);
  workerConfigured = true;
}

const LINE_SOURCE = "trip-day";
const LINE_LAYER = "trip-day-line";

/** Room for the markers and for the attribution when the day is fitted. */
const FIT_PADDING = { top: 48, right: 32, bottom: 40, left: 32 };

/**
 * The trip covers part of the map (a card on the left above `lg`, a sheet over
 * the lower part below it); the fit keeps the pins in the uncovered part.
 */
const PANEL_WIDTH_PX = 460 + 16;
const SHEET_SHARE = 0.58;

function fitPadding(container: HTMLElement | null) {
  const wide = window.matchMedia?.("(min-width: 1024px)").matches === true;
  if (wide) return { ...FIT_PADDING, left: FIT_PADDING.left + PANEL_WIDTH_PX };
  const height = container?.clientHeight ?? 0;
  return { ...FIT_PADDING, bottom: FIT_PADDING.bottom + Math.round(height * SHEET_SHARE) };
}
/** A day with a single stop must not end up at street level. */
const MAX_FIT_ZOOM = 15;
/** Close enough to read the streets around the stop that was opened. */
const SELECTED_ZOOM = 15;
/** Used with the city centre, before any stop has coordinates. */
const CITY_ZOOM = 12;

/**
 * `--color-text-primary`, for when no stylesheet has applied (jsdom). The line is
 * painted on a canvas, so it reads the token from the document, not a class.
 */
const LINE_FALLBACK = "#E6EAEF";

export interface TripMapCanvasProps {
  /** The pins of the selected day, in order (`toMapStops`). */
  stops: MapStop[];
  /** `[latitude, longitude]` of the destination, or `null` when unknown. */
  centre: [number, number] | null;
  selectedStopId: string | null;
  onSelectStop: (id: string | null) => void;
  /** The options Kiri is proposing, as dashed marks; none by default. */
  options?: OptionMark[];
}

/**
 * An option's mark: a dashed ring and its name. Decoration only (the option is
 * chosen from its card in the chat), so it takes no click and no focus.
 */
function optionElement(label: string): HTMLElement {
  const root = document.createElement("div");
  root.dataset.mapOption = "true";
  root.className = "pointer-events-none flex items-center gap-2";
  const ring = document.createElement("span");
  ring.className =
    "block h-6 w-6 rounded-full border-2 border-dashed border-text-primary/80 bg-bg-primary/30";
  const text = document.createElement("span");
  text.className =
    "whitespace-nowrap rounded-full border border-glass-border bg-glass-bg px-2 py-0.5 text-xs font-medium text-text-secondary backdrop-blur-md";
  text.textContent = label;
  root.append(ring, text);
  return root;
}

function reducedMotion(): boolean {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
}

function lineColour(): string {
  const value = window
    .getComputedStyle(document.documentElement)
    .getPropertyValue("--color-text-primary")
    .trim();
  return value || LINE_FALLBACK;
}

/**
 * The marker's DOM: a wrapper for MapLibre and a button inside it. MapLibre
 * writes an inline `style.transform` on the element it places, which would beat
 * the `scale` class and transition on every pan, so only the button scales.
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
    "flex h-7 w-7 cursor-pointer items-center justify-center",
    "border-2 border-bg-card text-xs font-semibold text-on-action shadow-field-glow",
    "transition-transform duration-150 motion-reduce:transition-none",
    "hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60",
    "data-[selected=true]:scale-125 data-[dimmed=true]:opacity-40",
    stop.kind === "stay" ? "rounded-md bg-accent" : "rounded-full bg-action",
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
        "line-color": lineColour(),
        "line-width": 3,
        "line-opacity": 0.7,
        "line-dasharray": [2, 1.5],
      },
    });
  };

  // `isStyleLoaded()` is false whenever tiles or the sprite are in flight, so wait on
  // `styledata`, which fires after every `setStyle`; `load` fires once and never replays
  if (map.isStyleLoaded()) apply();
  else map.once("styledata", apply);
}

/** The viewport that holds the whole day, or the city when it has no stop. */
function fitDay(map: MapLibreMap, stops: MapStop[], centre: [number, number] | null): void {
  const bounds = boundsOf(stops);
  if (bounds) {
    map.fitBounds(bounds, {
      padding: fitPadding(map.getContainer()),
      maxZoom: MAX_FIT_ZOOM,
      animate: !reducedMotion(),
    });
  } else if (centre) {
    map.easeTo({
      center: [centre[1], centre[0]],
      zoom: CITY_ZOOM,
      padding: fitPadding(map.getContainer()),
      animate: !reducedMotion(),
    });
  }
}

/**
 * The MapLibre instance: a numbered marker per stop and a straight line through
 * them (nothing here routes). Markers are added without waiting for `load`, so
 * they show even when tiles cannot be fetched (e2e blocks them); the line waits.
 */
export function TripMapCanvas({
  stops,
  centre,
  selectedStopId,
  onSelectStop,
  options = [],
}: TripMapCanvasProps) {
  const { t } = useLanguage();
  const { theme } = useTheme();
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const optionMarkersRef = useRef(new Map<string, Marker>());
  /** Per stop: the marker MapLibre positions and the button inside it. */
  const markersRef = useRef(new Map<string, { marker: Marker; button: HTMLButtonElement }>());
  /** MapLibre needs WebGL 2 and throws without it; the page must not go down. */
  const [unsupported, setUnsupported] = useState(false);

  // read through refs so the markers never close over stale values nor get rebuilt for them
  const onSelectRef = useRef(onSelectStop);
  const labelsRef = useRef(t.plan.map);
  const stopsRef = useRef(stops);
  const centreRef = useRef(centre);
  /** The theme the current style was built for; `setStyle` follows it. */
  const styleThemeRef = useRef(theme);
  /** The stop the viewport was last moved for: only a change moves it again. */
  const selectedRef = useRef<string | null>(null);
  /** Read once, when the map is created. */
  const initialRef = useRef<{
    centre: [number, number] | null;
    stop: MapStop | null;
    theme: "light" | "dark";
  }>({ centre, stop: stops[0] ?? null, theme });

  // declared first, so it runs before any effect below reads a ref
  useEffect(() => {
    onSelectRef.current = onSelectStop;
    labelsRef.current = t.plan.map;
    stopsRef.current = stops;
    centreRef.current = centre;
  });

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const { centre: from, stop, theme: startTheme } = initialRef.current;
    const start: [number, number] | null = from
      ? [from[1], from[0]]
      : stop
        ? [stop.lon, stop.lat]
        : null;

    // without WebGL 2 MapLibre throws; that costs the map only, never the error boundary
    let map: MapLibreMap;
    try {
      configureWorker();
      map = new MapLibreMap({
        container,
        style: STYLE_URLS[startTheme],
        center: start ?? [0, 20],
        zoom: start ? CITY_ZOOM : 1,
        // the tiles are someone else's data: their credit stays expanded
        attributionControl: { compact: false },
      });
    } catch {
      // at most once per mount, not a sync loop
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setUnsupported(true);
      return;
    }
    // MapLibre labels these in English; an effect below translates them
    map.addControl(new NavigationControl({ showCompass: false }), "top-right");
    mapRef.current = map;

    // the map is often created in a hidden pane (the phone's Trip tab), so the first fit
    // is at zero size; refit on resize unless an open activity owns the viewport
    map.on("resize", () => {
      if (selectedRef.current !== null) return;
      fitDay(map, stopsRef.current, centreRef.current);
    });

    const markers = markersRef.current;
    const optionMarkers = optionMarkersRef.current;
    return () => {
      for (const { marker } of markers.values()) marker.remove();
      markers.clear();
      for (const marker of optionMarkers.values()) marker.remove();
      optionMarkers.clear();
      map.remove();
      mapRef.current = null;
    };
    // created once: the theme swaps the style in its own effect, keeping the viewport
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const changed = styleThemeRef.current !== theme;
    styleThemeRef.current = theme;
    if (!map || !changed) return;
    map.setStyle(STYLE_URLS[theme]);
    // a new style drops the app's sources and layers (DOM markers survive it)
    drawLine(map, stopsRef.current);
  }, [theme]);

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
    // keyed on `t`: switching language does not remount the planner
  }, [t]);

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
        // the id survives removing an earlier card of the day, the number does not
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

    // an open activity owns the viewport even when a chat turn rewrites the day;
    // closing it runs this effect too, which is the only fit on the way out
    if (!stops.some((stop) => stop.id === selectedStopId)) fitDay(map, stops, centre);
  }, [stops, centre, t, selectedStopId]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const marks = optionMarkersRef.current;
    const wanted = new Map(options.map((option) => [option.id, option]));
    for (const [id, marker] of marks) {
      if (wanted.has(id)) continue;
      marker.remove();
      marks.delete(id);
    }
    for (const option of options) {
      if (marks.has(option.id)) continue;
      const label = interpolate(t.plan.map.option, { title: option.title });
      marks.set(
        option.id,
        new Marker({ element: optionElement(label), anchor: "left", offset: [-12, 0] })
          .setLngLat([option.lon, option.lat])
          .addTo(map)
      );
    }
  }, [options, t]);

  useEffect(() => {
    // pins are read from the DOM: this effect only restyles what is on screen
    const pins = containerRef.current?.querySelectorAll<HTMLElement>("[data-map-stop]") ?? [];
    const open = stops.find((stop) => stop.id === selectedStopId) ?? null;
    for (const pin of pins) {
      const selected = pin.dataset.mapStop === selectedStopId;
      pin.dataset.selected = selected ? "true" : "false";
      pin.dataset.dimmed = open && !selected ? "true" : "false";
      if (selected) pin.setAttribute("aria-current", "true");
      else pin.removeAttribute("aria-current");
    }

    // centre a newly opened activity, never zooming out, and only when the selection
    // itself changed (this also runs on a day change); closing is the markers effect's fit
    const map = mapRef.current;
    const previous = selectedRef.current;
    selectedRef.current = selectedStopId;
    if (!map || previous === selectedStopId || !open) return;
    map.easeTo({
      center: [open.lon, open.lat],
      padding: fitPadding(map.getContainer()),
      zoom: Math.max(map.getZoom(), SELECTED_ZOOM),
      animate: !reducedMotion(),
    });
  }, [selectedStopId, stops]);

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
      className="h-full w-full [&_.maplibregl-ctrl-attrib]:text-xs"
    />
  );
}
