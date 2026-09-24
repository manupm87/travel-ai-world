"use client";

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
 * Where the browser loads MapLibre's worker from (TRA-181).
 *
 * MapLibre 6 runs its tile pipeline in a separate module worker and locates
 * that file through `import.meta.url` — which the bundler does not preserve:
 * under Next/Turbopack it resolves to the page itself, the worker loads HTML
 * and dies, and the map is pins over a blank canvas, with no error anywhere.
 * `scripts/copy-maplibre-worker.mjs` (run before `next dev`/`next build`)
 * copies the worker and its `maplibre-gl-shared` sibling into
 * `public/maplibre/` as `.js` files — the extension every server maps to a
 * JavaScript MIME type, which a module worker insists on — with the worker's
 * relative import rewritten to match, so this same-origin URL resolves. The
 * prefix mirrors `basePath` in `next.config.ts`, which only applies to
 * production builds.
 */
export const WORKER_URL = `${
  process.env.NODE_ENV === "production" ? (process.env.NEXT_PUBLIC_BASE_PATH ?? "") : ""
}/maplibre/maplibre-gl-worker.js`;

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
 * The trip floats over the map (TRA-238): a card on the left above `lg`, a
 * sheet over the lower part below it. The fit keeps the day's pins in the
 * part of the map that is not under it.
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
 * The value of `--color-text-primary`: the day's route is drawn in the text
 * colour, dashed (TRA-238). The line is painted on a canvas, so it cannot
 * carry a Tailwind class: the token is read from the document, and this is what
 * it holds for the environments where no stylesheet has applied yet (jsdom).
 */
const LINE_FALLBACK = "#E6EAEF";

export interface TripMapCanvasProps {
  /** The pins of the selected day, in order (`toMapStops`). */
  stops: MapStop[];
  /** `[latitude, longitude]` of the destination, or `null` when unknown. */
  centre: [number, number] | null;
  selectedStopId: string | null;
  onSelectStop: (id: string | null) => void;
  /** The options Kiri is proposing, as dashed marks (TRA-238); none by default. */
  options?: OptionMark[];
}

/**
 * An option's mark: a dashed ring and its name beside it. Decoration for the
 * eye — the option itself is a card in the chat, where it is chosen — so it
 * takes no click and no focus, and its label is plain text.
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
  options = [],
}: TripMapCanvasProps) {
  const { t } = useLanguage();
  const { theme } = useTheme();
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  /** Per option on the map: its dashed mark. */
  const optionMarkersRef = useRef(new Map<string, Marker>());
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
  const centreRef = useRef(centre);
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
    centreRef.current = centre;
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
      configureWorker();
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

    // The map is often born in a pane that is not on screen yet — the phone's
    // Trip tab (TRA-238) — so its first fit is made at no size at all. When
    // the container gets its real size, the day is fitted again, unless an
    // open activity owns the viewport.
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

    // An open activity owns the viewport: its pin keeps the map where the
    // selection put it even when the itinerary is rewritten under it — a chat
    // turn swapping another slot of the same day gives a new `stops` array,
    // and fitting here would zoom back out to the whole day behind the page
    // the traveller is reading. Everything else fits: a day with nothing open,
    // a day change, and the closing of an activity, which runs this effect too
    // and is therefore the only fit on the way out.
    if (!stops.some((stop) => stop.id === selectedStopId)) fitDay(map, stops, centre);
  }, [stops, centre, t, selectedStopId]);

  // ── The options Kiri proposes: dashed marks, added and dropped by id ──────
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
    // place it among its streets. Never a zoom out on the way in: a reader who
    // came in closer keeps their zoom. The viewport only moves when the
    // selection itself changed — the effect also runs when the day does — and
    // only on the way in: giving the whole day back when an activity is closed
    // is the markers effect's fit, which runs on the same commit.
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
