import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, renderWithProviders, screen, within } from "@/test/render";
import en from "@/i18n/en";
import es from "@/i18n/es";
import { interpolate } from "@/i18n";
import { useLanguage } from "@/context/LanguageContext";
import { EMPTY_ITINERARY, applyItineraryOps } from "@/hooks/plannerReducer";
import { ACTIVITIES, FIRST_ITINERARY_OPS, HOTELS } from "@/data/planner-demo/session";

/**
 * MapLibre draws with WebGL and reaches for `window.URL.createObjectURL`, which
 * jsdom has neither of; the stubs below record what the component asks the map
 * to do, which is exactly what these tests are about. The markers are real DOM,
 * so they are queried through the testing library as any other button.
 */
const maplibre = vi.hoisted(() => {
  const handlers = new Map<string, (() => void)[]>();
  const instances: MapStub[] = [];
  /** Makes the next `new Map()` throw, as a browser without WebGL 2 does. */
  const failNext = { value: false };

  class MarkerStub {
    element: HTMLElement;
    lngLat: [number, number] | null = null;
    removed = false;
    constructor(options: { element: HTMLElement }) {
      this.element = options.element;
    }
    setLngLat(lngLat: [number, number]) {
      this.lngLat = lngLat;
      return this;
    }
    addTo(map: MapStub) {
      map.container.append(this.element);
      return this;
    }
    getElement() {
      return this.element;
    }
    remove() {
      this.removed = true;
      this.element.remove();
      return this;
    }
  }

  /**
   * The real control renders two buttons with these classes and labels them in
   * English; the component rewrites the labels, so the stub has to put the
   * buttons on the page.
   */
  class NavigationControlStub {
    element = document.createElement("div");
    constructor() {
      for (const name of ["zoom-in", "zoom-out"]) {
        const button = document.createElement("button");
        button.className = `maplibregl-ctrl-${name}`;
        button.setAttribute("aria-label", name === "zoom-in" ? "Zoom in" : "Zoom out");
        this.element.append(button);
      }
    }
  }

  class MapStub {
    container: HTMLElement;
    style: string;
    styles: string[];
    fits: unknown[] = [];
    eases: unknown[] = [];
    controls: unknown[] = [];
    sources = new Map<string, { data: unknown }>();
    layers = new Set<string>();
    removed = false;
    /**
     * As in MapLibre, where `isStyleLoaded()` is false whenever the sprite or
     * any tile is in flight — after every `setStyle`, not only before the
     * first render.
     */
    styleLoaded = true;
    constructor(options: { container: HTMLElement; style: string }) {
      if (failNext.value) {
        failNext.value = false;
        // What MapLibre throws when the browser has no WebGL 2.
        throw new Error("WebGL2 is required to display this map");
      }
      this.container = options.container;
      this.style = options.style;
      this.styles = [options.style];
      instances.push(this);
    }
    addControl(control: unknown) {
      this.controls.push(control);
      if (control instanceof NavigationControlStub) this.container.append(control.element);
      return this;
    }
    setStyle(style: string) {
      this.style = style;
      this.styles.push(style);
      this.sources.clear();
      this.layers.clear();
      this.styleLoaded = false;
      return this;
    }
    isStyleLoaded() {
      return this.styleLoaded;
    }
    on() {
      return this;
    }
    off(type: string, handler: () => void) {
      handlers.set(type, (handlers.get(type) ?? []).filter((one) => one !== handler));
      return this;
    }
    /**
     * As MapLibre's `Evented.once`: the handler runs on the next event of that
     * type, then is dropped. `load` is fired once per map and is never
     * replayed — the stub models that by never firing it at all, so code that
     * waits for it after the first style is code that waits forever.
     */
    once(type: string, handler: () => void) {
      handlers.set(type, [...(handlers.get(type) ?? []), handler]);
      return this;
    }
    fire(type: string) {
      const waiting = handlers.get(type) ?? [];
      handlers.set(type, []);
      // A style that has finished loading is a loaded style from then on.
      if (type === "styledata") this.styleLoaded = true;
      for (const handler of waiting) handler();
    }
    fitBounds(bounds: unknown, options: unknown) {
      this.fits.push({ bounds, options });
      return this;
    }
    easeTo(options: unknown) {
      this.eases.push(options);
      return this;
    }
    /** The zoom a city-wide day sits at; the component never zooms out from it. */
    getZoom() {
      return 12;
    }
    getSource(id: string) {
      const source = this.sources.get(id);
      if (!source) return undefined;
      return { setData: (data: unknown) => void (source.data = data) };
    }
    addSource(id: string, source: { data: unknown }) {
      this.sources.set(id, { data: source.data });
      return this;
    }
    removeSource(id: string) {
      this.sources.delete(id);
      return this;
    }
    getLayer(id: string) {
      return this.layers.has(id) ? { id } : undefined;
    }
    addLayer(layer: { id: string }) {
      this.layers.add(layer.id);
      return this;
    }
    removeLayer(id: string) {
      this.layers.delete(id);
      return this;
    }
    remove() {
      this.removed = true;
      return this;
    }
  }

  return { MapStub, MarkerStub, NavigationControlStub, instances, handlers, failNext };
});

vi.mock("maplibre-gl", () => ({
  Map: maplibre.MapStub,
  Marker: maplibre.MarkerStub,
  NavigationControl: maplibre.NavigationControlStub,
  LngLatBounds: class {},
}));

// Imported after the mock, so the component picks the stubs up.
const { TripMapCanvas, STYLE_URLS } = await import("./TripMapCanvas");
const { TripMap } = await import("./TripMap");
const { toMapStops } = await import("./mapStops");

const itinerary = applyItineraryOps(EMPTY_ITINERARY, FIRST_ITINERARY_OPS);
const BUDAPEST: [number, number] = [47.4979, 19.0402];

const lastMap = () => maplibre.instances[maplibre.instances.length - 1]!;
const markers = () => Array.from(document.querySelectorAll<HTMLElement>("[data-map-stop]"));

/** One array per day, as `PlannerClientPage`'s `useMemo` gives the component. */
const stopsByDay = new Map<number, ReturnType<typeof toMapStops>>();
const stopsFor = (day: number) => {
  const cached = stopsByDay.get(day);
  if (cached) return cached;
  const stops = toMapStops(itinerary, day);
  stopsByDay.set(day, stops);
  return stops;
};

function renderCanvas(day: number, selectedStopId: string | null = null) {
  const onSelectStop = vi.fn();
  const canvas = (forDay: number, selected: string | null) => (
    <TripMapCanvas
      stops={stopsFor(forDay)}
      centre={BUDAPEST}
      selectedStopId={selected}
      onSelectStop={onSelectStop}
    />
  );
  const view = renderWithProviders(canvas(day, selectedStopId));
  const show = (nextDay: number, nextSelected: string | null = null) =>
    view.rerender(canvas(nextDay, nextSelected));
  return { onSelectStop, show, ...view };
}

describe("TripMapCanvas", () => {
  beforeEach(() => {
    maplibre.instances.length = 0;
    maplibre.handlers.clear();
    document.documentElement.removeAttribute("data-theme");
    window.localStorage.clear();
  });

  it("pins the stay and the stops of the selected day, numbered and labelled", () => {
    renderCanvas(1);

    const labels = markers().map((marker) => marker.getAttribute("aria-label"));
    expect(labels[0]).toBe(interpolate(en.plan.map.stay, { title: HOTELS.rum.title }));
    expect(labels[1]).toBe(
      interpolate(en.plan.map.marker, { index: 1, title: ACTIVITIES.greatMarket.title })
    );
    expect(markers()[0]).toHaveTextContent("H");
    expect(markers()[1]).toHaveTextContent("1");
    expect(markers()).toHaveLength(toMapStops(itinerary, 1).length);
  });

  it("draws the day's line and fits the viewport to it", () => {
    renderCanvas(1);
    const map = lastMap();

    expect(map.layers.has("trip-day-line")).toBe(true);
    expect(map.fits).toHaveLength(1);
    expect(map.fits[0]).toMatchObject({ bounds: expect.any(Array) });
  });

  it("replaces the markers and fits again when the day changes", () => {
    const { show } = renderCanvas(1);
    const map = lastMap();
    const before = markers().map((marker) => marker.dataset.mapStop);

    show(2);

    const after = markers().map((marker) => marker.dataset.mapStop);
    expect(after).not.toEqual(before);
    // The stay is the same pin on every day; it is not rebuilt.
    expect(after[0]).toBe(before[0]);
    expect(map.fits.length).toBeGreaterThan(1);
  });

  it("selects a stop from its marker and mirrors a selection made elsewhere", () => {
    const { onSelectStop, show } = renderCanvas(1);
    const [stay, first] = markers();

    fireEvent.click(first!);
    expect(onSelectStop).toHaveBeenCalledWith(first!.dataset.mapStop);

    expect(first!.dataset.selected).toBe("false");
    show(1, first!.dataset.mapStop ?? null);
    expect(first!.dataset.selected).toBe("true");
    expect(first!.getAttribute("aria-current")).toBe("true");
    // The rest of the day steps back while one stop is open.
    expect(stay!.dataset.dimmed).toBe("true");
    expect(first!.dataset.dimmed).toBe("false");

    show(1, null);
    expect(first!.dataset.selected).toBe("false");
    expect(first!.getAttribute("aria-current")).toBeNull();
    expect(stay!.dataset.dimmed).toBe("false");
  });

  it("centres the open stop, and fits the day again when it is closed", () => {
    const { show } = renderCanvas(1);
    const map = lastMap();
    const [, first] = markers();
    const fitsBefore = map.fits.length;
    const stop = stopsFor(1).find((one) => one.id === first!.dataset.mapStop)!;

    show(1, stop.id);

    // Centred on the stop, and never further out than the day's own zoom.
    expect(map.eases[map.eases.length - 1]).toMatchObject({
      center: [stop.lon, stop.lat],
      zoom: 15,
    });
    expect(map.fits).toHaveLength(fitsBefore);

    show(1, null);

    expect(map.fits.length).toBe(fitsBefore + 1);
  });

  it("keeps the open stop centred when the itinerary is rewritten under it", () => {
    const onSelectStop = vi.fn();
    const stops = stopsFor(1);
    const open = stops.find((stop) => stop.kind !== "stay")!;
    const canvas = (forStops: typeof stops) => (
      <TripMapCanvas
        stops={forStops}
        centre={BUDAPEST}
        selectedStopId={open.id}
        onSelectStop={onSelectStop}
      />
    );
    const view = renderWithProviders(canvas(stops));
    const map = lastMap();
    const fitsBefore = map.fits.length;

    // A chat turn touching this day hands the map a new array while the
    // activity stays open: the viewport belongs to the open pin, not the day.
    view.rerender(canvas([...stops]));

    expect(map.fits).toHaveLength(fitsBefore);
  });

  it("opens on the destination's centre and eases there when nothing is pinned", () => {
    renderWithProviders(
      <TripMapCanvas stops={[]} centre={BUDAPEST} selectedStopId={null} onSelectStop={vi.fn()} />
    );
    const map = lastMap();

    expect(map.fits).toHaveLength(0);
    // `[latitude, longitude]` in, `[longitude, latitude]` out.
    expect(map.eases[0]).toMatchObject({ center: [BUDAPEST[1], BUDAPEST[0]] });
  });

  it("says so instead of taking the page down when the browser has no WebGL", () => {
    maplibre.failNext.value = true;

    renderCanvas(1);

    expect(screen.getByRole("status")).toHaveTextContent(en.plan.map.unsupported);
    expect(markers()).toHaveLength(0);
  });

  it("renumbers the pins when a card of the same day is removed", () => {
    const onSelectStop = vi.fn();
    const trimmed = applyItineraryOps(itinerary, [
      {
        op: "remove_activity",
        slot: { day: 1, part: "morning" },
        card_id: ACTIVITIES.greatMarket.id,
      },
    ]);
    const canvas = (stops: ReturnType<typeof toMapStops>) => (
      <TripMapCanvas
        stops={stops}
        centre={BUDAPEST}
        selectedStopId={null}
        onSelectStop={onSelectStop}
      />
    );
    const view = renderWithProviders(canvas(stopsFor(1)));

    // Every later card keeps its id — `<day>:<part>:<cardId>` — while its
    // number shifts down, so the pins are updated, not rebuilt.
    const after = toMapStops(trimmed, 1);
    view.rerender(canvas(after));

    expect(markers().map((marker) => marker.textContent)).toEqual(
      after.map((stop) => (stop.kind === "stay" ? "H" : String(stop.index)))
    );
    expect(markers()[1]).toHaveAccessibleName(
      interpolate(en.plan.map.marker, { index: 1, title: after[1]!.title })
    );
  });

  it("follows the theme: the dark style by default, the light one when it is set", () => {
    renderCanvas(1);
    const map = lastMap();
    expect(map.style).toBe(STYLE_URLS.dark);

    act(() => {
      window.localStorage.setItem("theme", "light");
      window.dispatchEvent(new StorageEvent("storage", { key: "theme", newValue: "light" }));
    });

    expect(map.style).toBe(STYLE_URLS.light);
    // A new style drops the app's layers and is not loaded yet; they come back
    // when it is — with `styledata`, which fires again, and never with `load`,
    // which the map fires once and never replays.
    expect(map.isStyleLoaded()).toBe(false);
    expect(map.layers.has("trip-day-line")).toBe(false);
    map.fire("styledata");
    expect(map.layers.has("trip-day-line")).toBe(true);
  });

  it("draws the day's line when the style is still loading at the day change", () => {
    const { show } = renderCanvas(1);
    const map = lastMap();
    // Tiles in flight: the style is not "loaded", as after any `setStyle`.
    map.styleLoaded = false;
    map.layers.clear();
    map.sources.clear();

    show(2);
    expect(map.layers.has("trip-day-line")).toBe(false);

    map.fire("styledata");
    expect(map.layers.has("trip-day-line")).toBe(true);
  });

  it("labels the zoom controls in the reader's language, after a switch too", async () => {
    function SwitchToSpanish() {
      const { setLanguage } = useLanguage();
      return (
        <button type="button" onClick={() => setLanguage("es")}>
          es
        </button>
      );
    }
    renderWithProviders(
      <>
        <SwitchToSpanish />
        <TripMapCanvas
          stops={stopsFor(1)}
          centre={BUDAPEST}
          selectedStopId={null}
          onSelectStop={vi.fn()}
        />
      </>
    );

    expect(screen.getByRole("button", { name: en.plan.map.zoomIn })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "es" }));

    expect(await screen.findByRole("button", { name: es.plan.map.zoomIn })).toHaveAttribute(
      "title",
      es.plan.map.zoomIn
    );
    expect(screen.getByRole("button", { name: es.plan.map.zoomOut })).toBeInTheDocument();
  });
});

describe("TripMap", () => {
  beforeEach(() => {
    maplibre.instances.length = 0;
    maplibre.handlers.clear();
  });

  it("is a region named after the day, and says when the day has nothing to pin", async () => {
    renderWithProviders(
      <TripMap
        stops={[]}
        selectedDay={2}
        centre={BUDAPEST}
        selectedStopId={null}
        onSelectStop={vi.fn()}
      />
    );

    const region = screen.getByRole("region", {
      name: interpolate(en.plan.map.region, { day: 2 }),
    });
    expect(within(region).getByText(en.plan.map.empty)).toBeInTheDocument();
    expect(await screen.findByTestId("trip-map-canvas")).toBeInTheDocument();
  });

  it("hides the empty state as soon as the day has a stop", async () => {
    renderWithProviders(
      <TripMap
        stops={toMapStops(itinerary, 1)}
        selectedDay={1}
        centre={BUDAPEST}
        selectedStopId={null}
        onSelectStop={vi.fn()}
      />
    );

    expect(screen.queryByText(en.plan.map.empty)).not.toBeInTheDocument();
    expect(await screen.findByTestId("trip-map-canvas")).toBeInTheDocument();
  });
});
