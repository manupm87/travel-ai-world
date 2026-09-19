import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, renderWithProviders, screen, within } from "@/test/render";
import en from "@/i18n/en";
import { interpolate } from "@/i18n";
import { EMPTY_ITINERARY, applyItineraryOps } from "@/hooks/plannerReducer";
import { ACTIVITIES, FIRST_ITINERARY_OPS, HOTELS } from "@/data/planner-demo/session";

/**
 * MapLibre draws with WebGL and reaches for `window.URL.createObjectURL`, which
 * jsdom has neither of; the stubs below record what the component asks the map
 * to do, which is exactly what these tests are about. The markers are real DOM,
 * so they are queried through the testing library as any other button.
 */
const maplibre = vi.hoisted(() => {
  const handlers = new Map<string, () => void>();
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
      return this;
    }
    setStyle(style: string) {
      this.style = style;
      this.styles.push(style);
      this.sources.clear();
      this.layers.clear();
      return this;
    }
    isStyleLoaded() {
      return true;
    }
    on() {
      return this;
    }
    off(type: string) {
      handlers.delete(type);
      return this;
    }
    once(type: string, handler: () => void) {
      handlers.set(type, handler);
      return this;
    }
    fire(type: string) {
      handlers.get(type)?.();
    }
    fitBounds(bounds: unknown, options: unknown) {
      this.fits.push({ bounds, options });
      return this;
    }
    easeTo(options: unknown) {
      this.eases.push(options);
      return this;
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

  return { MapStub, MarkerStub, instances, handlers, failNext };
});

vi.mock("maplibre-gl", () => ({
  Map: maplibre.MapStub,
  Marker: maplibre.MarkerStub,
  NavigationControl: class {},
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
    const [, first] = markers();

    fireEvent.click(first!);
    expect(onSelectStop).toHaveBeenCalledWith(first!.dataset.mapStop);

    expect(first!.dataset.selected).toBe("false");
    show(1, first!.dataset.mapStop ?? null);
    expect(first!.dataset.selected).toBe("true");
    expect(first!.getAttribute("aria-current")).toBe("true");

    show(1, null);
    expect(first!.dataset.selected).toBe("false");
    expect(first!.getAttribute("aria-current")).toBeNull();
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

  it("follows the theme: the dark style by default, the light one when it is set", () => {
    renderCanvas(1);
    const map = lastMap();
    expect(map.style).toBe(STYLE_URLS.dark);

    act(() => {
      window.localStorage.setItem("theme", "light");
      window.dispatchEvent(new StorageEvent("storage", { key: "theme", newValue: "light" }));
    });

    expect(map.style).toBe(STYLE_URLS.light);
    // A new style drops the app's layers; they come back with `styledata`.
    expect(map.layers.has("trip-day-line")).toBe(false);
    map.fire("styledata");
    expect(map.layers.has("trip-day-line")).toBe(true);
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
