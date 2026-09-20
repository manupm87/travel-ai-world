# 0016 — The planner's map is MapLibre GL over OpenFreeMap's hosted tiles

**Status:** Accepted
**Date:** 2026-09-19

## Context

The planner shows one day at a time (TRA-176) and half of what a day means is geography: where the
stops are, in which order, and where the hotel is. Until now the map slot held `MapPlaceholder`, a
decorative panel plus a numbered list of the day's stops.

Three forces decide the shape of the real map:

- **The frontend is a static export** (S3 + CloudFront, ADR 0011). There is no server to render a
  map on and no place to proxy tile requests through; whatever we choose runs in the browser.
- **The planner is city-agnostic** (TRA-164/TRA-168). A new city is `/add-city` plus `just index`
  plus a backend deploy — today, with no map step at all. Anything that adds "and now build and
  upload this city's tiles" to that runbook makes every new city more expensive forever.
- **Cost.** AWS v3 runs on a 30 €/month budget (ADR 0009). A map must not add a bill or a quota to
  watch.

An earlier plan (dropped before this ADR) was to extract Budapest from OpenStreetMap as a PMTiles
archive on our own S3 bucket and read it with `pmtiles` + `@protomaps/basemaps`. It is cheap and it
has no third party in the request path, but it is per-city by construction.

## Decision

The map is **MapLibre GL JS** (BSD-3-Clause, `maplibre-gl`) rendering **OpenFreeMap**'s hosted
OpenMapTiles styles: `https://tiles.openfreemap.org/styles/positron` in the light theme and
`.../styles/dark` otherwise. OpenFreeMap is free, needs no registration and no API key, publishes no
request limit, allows commercial use, refreshes from OSM weekly, and can be self-hosted from the
same OpenMapTiles data if it ever goes away.

In the code (`src/frontend/src/components/planner/v2/`):

- `mapStops.ts` is pure: `toMapStops(itinerary, selectedDay)` turns the draft into ordered pins —
  the stay first as an unnumbered `"H"`, then the day's cards numbered 1..n in slot order, skipping
  any card without coordinates — plus `boundsOf` and `lineOf`. `PlannerClientPage` calls it once and
  gives the result to both columns, so the number beside a card in the panel and the number on its
  pin can never disagree.
- `TripMap.tsx` is the region and the empty state; it pulls `TripMapCanvas.tsx` in through
  `next/dynamic` with `ssr: false`, so MapLibre is a chunk of `/plan/` alone and the landing bundle
  is untouched.
- `TripMapCanvas.tsx` owns the instance: HTML markers (ordinary buttons carrying the theme tokens
  and `data-map-stop`), a `LineString` layer joining the day's stops with straight segments — no
  routing; `RouteStrip` keeps the real travel times — `fitBounds` on every change of the day, and
  `setStyle` when the theme changes. Markers are added when the map object is built rather than in
  its `load` callback, so they exist even when the tiles cannot be fetched.
- Tile requests are made by the library, not by app code, so they are the one sanctioned network
  call outside `src/services/`.
- **The worker is served from `public/maplibre/`** (TRA-181). MapLibre 6 is ESM-only and runs its
  tile pipeline in a separate module worker (`maplibre-gl-worker.mjs`, importing
  `./maplibre-gl-shared.mjs`) that it locates through `import.meta.url`. A bundler does not keep
  that URL meaningful — under Next/Turbopack it resolves to the page, the worker loads HTML and
  exits, and the map is pins and attribution over a blank canvas with no error in the console. So
  `scripts/copy-maplibre-worker.mjs` copies the two files from `node_modules` into the gitignored
  `public/maplibre/` before every `next dev` and `next build` (`predev`, `prebuild`,
  `pretest:e2e*`) — as `.js`, with the worker's relative import rewritten, because a module
  worker is refused unless the server answers with a JavaScript MIME type and nginx's stock
  `mime.types` knows `js` but not `mjs` — and `TripMapCanvas` calls `setWorkerUrl` with that
  same-origin path once, before the first map. Upgrading `maplibre-gl` needs nothing else: the
  copy follows the installed version, and stops loudly if the worker ever gains a relative import
  the script does not copy.

`PlannerLayout` becomes three columns at `lg` and above (chat ≈ 30 %, trip panel ≈ 40 %, map ≈ 30 %);
below `lg` the existing Map tab shows the same map full height. `MapPlaceholder` is deleted.

## Alternatives

| Option | Why not |
|---|---|
| PMTiles on our S3 + `@protomaps/basemaps` | A per-city human step (extract, build, upload) in a flow whose whole point is that adding a city is one command. |
| MapTiler / Mapbox / Stadia | An API key in a static bundle, a quota to watch and a bill to forecast, for a feature that renders the same OSM data. |
| Raster OSM tiles (`tile.openstreetmap.org`) | The OSMF tile usage policy forbids application traffic; raster also loses the theme switch and retina crispness. |
| Leaflet instead of MapLibre | Smaller, but raster-first; vector styles, a themed basemap and a line layer are what MapLibre is for. |

## Consequences

- **Good.** No key, no quota, no per-city infrastructure, no Terraform. The same code maps Budapest,
  Bologna and whatever `/add-city` adds next. Attribution is rendered by MapLibre itself, so the OSM
  credit is never accidentally dropped.
- **Bad.** A third party is now in the runtime path of `/plan/`. If OpenFreeMap is slow or down the
  basemap is blank — the pins, the line and the whole itinerary still render, because nothing in the
  component waits for tiles.
- **Cost.** `maplibre-gl` is ~200 kB gzipped, loaded only on `/plan/` and only in the browser.
- **Exit path.** OpenMapTiles is open data and OpenFreeMap publishes how it is run: self-hosting is
  changing two URLs in `STYLE_URLS`. Revisit if latency from Europe degrades, if OpenFreeMap
  announces limits, or when a city outside its coverage is added.
