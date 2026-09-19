# City corpus

Builds the knowledge base the trip planner retrieves from (epic TRA-136): licence-clean
documents about a city, normalized into one JSONL file that the indexer embeds and loads into
the vector store. The JSONL in `data/<city>/` is **committed and is the source of truth**; the
vector store holds a copy of each document in its payload.

Cities are TOML files under `cities/`; Budapest is the reference one (see "Add a city").

## Sources and licences

| Source | What | Licence |
|---|---|---|
| [en.wikivoyage.org](https://en.wikivoyage.org/wiki/Budapest) | `Budapest` and its 20 district guides (`Budapest/*`, redirects excluded): every listing template (`see`, `do`, `buy`, `eat`, `drink`, `sleep`, `go`, `listing`) and the prose of each section | CC BY-SA 4.0 |
| [es.wikivoyage.org](https://es.wikivoyage.org/wiki/Budapest) | The city page (mostly prose) | CC BY-SA 4.0 |
| [en.wikipedia.org](https://en.wikipedia.org/) | Articles in ten city-scoped categories: tourist attractions, museums, thermal baths, bridges, buildings and structures, squares, churches, monuments and memorials, synagogues, parks | CC BY-SA 4.0 |
| [OpenStreetMap](https://www.openstreetmap.org/) (Overpass API) | Hotels, hostels, guest houses, apartments; restaurants, cafés; bars, pubs; museums, attractions, viewpoints, historic places, galleries with a Wikidata item; named parks; thermal baths. Also the 23 district boundaries and the Wikidata tags used to link listings | ODbL 1.0 |
| [Wikidata](https://www.wikidata.org/) + [Commons](https://commons.wikimedia.org/) | Enrichment only (no documents): image, official website, coordinates, heritage status, Spanish label. Images keep their own licence and author | CC0 (Wikidata); per file (Commons) |
| [Open-Meteo](https://open-meteo.com/) historical API | Daily 1996–2025 weather → 12 monthly climate documents | CC BY 4.0 |
| `curated/<city>/tours.toml` (this repo) | Public tours no open source lists, above all free (tip-based) walking tours: hand-maintained from each operator's own website, summaries in our own words | CC BY-SA 4.0 (our text; the operator page is `source_url`) |

`Category:Baths in Budapest` (named in TRA-138) has no articles; the bath articles are in
`Category:Thermal baths in Budapest`. Google Places content, TripAdvisor and Booking are forbidden
sources (ToS).

Categories are city-scoped on purpose: `Landmarks in Hungary` and `Castles in Hungary` would add 46
articles, most of them outside Budapest. A category may set `require_coordinates`, which admits only
articles located inside the bounding box — `Buildings and structures in Budapest` needs it, or it
brings in embassies and government offices alongside the sights (12 skipped for Budapest). The
manifest reports documents per category and what each one skipped.

## Pipeline

1. **Wikivoyage, Wikipedia** → documents (TRA-138).
2. **OpenStreetMap** (TRA-139): district boundaries; then every named element with a `wikidata` tag
   gives its id to a document without one that has the same name within 75 m; then the category
   queries. An element that matches an existing listing or Wikipedia article (same Wikidata id, or
   same normalised name within 75 m) adds `osm_id`, `opening_hours`, `stars`, `cuisine`,
   `wheelchair` (and a missing `wikidata` or Commons file) to it. Other elements with a name and at
   least one of `wikidata`, `website`, `opening_hours`, `stars`, `cuisine` become new documents.
   Galleries need a Wikidata id, and swimming pools need thermal tags or a bath name.
3. **Wikidata + Commons**: for every document with a Wikidata id, fill `lat`/`lon` and `url` when
   missing, add `name_es`, `heritage` and `entity_id` (documents about the same entity share it).
   `image_url` is a 640 px Commons thumbnail of the first free-licensed file among the Wikidata image
   (P18), the listing's `image` and OSM's `wikimedia_commons`. Non-free files (NC, ND, fair use) are skipped.
4. **Districts**: every document with coordinates and no district gets one from the OSM boundary it
   falls in. The `[district_guides]` table in `cities/budapest.toml` maps the 23 administrative
   districts (by OSM `ref`; by name for a city whose boundaries carry none) to the 20 Wikivoyage
   guides. Districts I, III and XIV are split between two guides; the nearest Wikivoyage listing
   decides. Points in no boundary (Margaret Island) take the guide of the nearest listing within 1 km.
5. **Tours**: listings from any source that are things you *join* move to `category=tour` with a
   `tour_type` (`walking`, `bike`, `boat`, `bus`, `cave`, `food`, `other`). The automatic rule looks
   for a tour heading (*Tours*, *Guided tours*, *Cave tours*, *Boating*, *Cruises*, *Sightseeing*) or a
   tour-like name (tour, cruise, boat trip, sightseeing, hop-on/hop-off). `[reclassify]` in the tours
   file adds what the rule misses and excludes false positives. Rentals and scheduled public transport
   are not tours. Curated tours are then added as documents (`doc_id` `tour:<city>:<id>`). Their district
   comes from the boundaries.
6. **Climate**: monthly highs, lows, rainfall and days with ≥ 1 mm. Open-Meteo's reanalysis
   overestimates sunshine for Budapest (about 3,150 h a year against about 2,000 h measured), so
   sunshine is left out; rain days run about a third high, hence "about" in the text.

## Run

```bash
just corpus                      # from the repo root (city="budapest"): build, then the readiness report
just corpus-report city=budapest # only the report (flags="--no-gate" to print without failing)
just corpus-discover name="..."  # draft cities/<slug>.draft.toml for a new city
# or, from this directory:
uv run python -m city_corpus build budapest \
  [--sources wikivoyage,wikipedia,openstreetmap,wikidata,climate,tours] [--offline] [-v]
uv run python -m city_corpus report budapest [--no-gate] [--data-dir DIR]
uv run python -m city_corpus discover "Bologna" [-v]
```

Every API response is cached in `.cache/` (ignored by git). A rebuild with a warm cache makes no
requests and writes byte-identical files; `--offline` fails on a cache miss instead of fetching.
Delete `.cache/` to pick up new page revisions and map data. A cold build takes 5–10 minutes: requests
are serial, with a descriptive User-Agent, `maxlag` and backoff for Wikimedia, a 5-second pause
between Overpass queries, and retries on 429/5xx. Wikidata and Commons are requested in batches of 50
sorted ids, so a change to the set of ids re-fetches those batches.

## Output

`data/<city>/documents.jsonl`, one document per line:

| Field | Meaning |
|---|---|
| `doc_id` | Stable id: `wv:en:Budapest/Belváros#see:parliament` (listing), `wv:en:Budapest/Belváros#section:get-in/from-buda:c1` (prose chunk), `wp:en:3032195#s2-c1` (Wikipedia section 2, chunk 1), `osm:way/47425748`, `om:climate:budapest:07`, `tour:budapest:jewish-quarter`. A document moved to `tour` keeps its id. A repeated id gets `~2`, `~3` in page order |
| `city`, `district` | City slug; the Wikivoyage district guide name (from the guide page, or from the OSM boundaries for anything with coordinates; `null` for city-wide text) |
| `category` | `see`, `do`, `eat`, `drink`, `sleep`, `tour`, `practical`, `history`, `transport`, `climate`, `neighbourhood` (Wikivoyage `buy` → `do`, `go` → `transport`) |
| `kind` | `listing` or `prose` |
| `name` | Listing or article name (`null` for Wikivoyage prose) |
| `text` | What gets embedded. Listings: name (alt), heading path, description, then address/directions/hours/price. Prose: heading path, blank line, chunk |
| `heading_path` | `Budapest › Belváros › Eat › Restaurants › Budget` |
| `lat`, `lon` | Both or neither, always inside the city bounding box |
| `hours`, `price`, `price_tier` | Listing facts; `price_tier` 1–3 from the Budget / Mid-range / Splurge section for eat, drink and sleep, or from OSM `stars` for hotels (≤ 2 → 1, 3 → 2, ≥ 4 → 3) |
| `url`, `image_url`, `wikidata` | Official site; free-licensed Commons thumbnail; Wikidata id |
| `source`, `source_url`, `license`, `lang` | Attribution: `wikivoyage`/`wikipedia`/`curated` (`CC BY-SA 4.0`), `openstreetmap` (`ODbL 1.0`), `open-meteo` (`CC BY 4.0`); page, element or operator URL; `en`/`es` |

Optional fields, written only when present. Listing extras: `alt`, `address`, `directions`, `phone`,
`checkin`, `checkout`, `image` (Commons file name). Enrichment: `entity_id`, `name_es`, `heritage`,
`image_license`, `image_author` (show them with the image), `osm_id`, `opening_hours` (OSM syntax),
`stars`, `cuisine`, `wheelchair`. Tours: `tour_type` (all tour documents); `operator`, `start_times`,
`days`, `duration_minutes`, `languages`, `price_model`, `booking_required`, `checked` (curated tours).
In an itinerary a tour is an `Activity` with `category="tour"`, `time`, `duration_minutes`, `cost` 0
for tip-based tours, and `booking_url` = `url`.

Prose is split by heading and chunked to at most 500 tokens (estimated as words × 1.3, heading
path included), repeating one paragraph between consecutive chunks; a short tail is folded into
the previous chunk. Wiki markup is stripped (link labels kept; inline templates such as
`{{station}}`, `{{HUF}}` or `{{km}}` rendered as text).

`data/<city>/manifest.json`: newest fetch time, counts per source, language, kind, category and
district, image coverage (overall and for `see`), `sleep` documents without a district (city-wide
text only), enrichment counters (OSM elements, merges, new documents, Wikidata links, image licences,
districts assigned), skipped listings, and the revision id of every Wikimedia page used.

The build validates before writing and fails on: duplicate or empty `doc_id`, `text` under 40
characters, wrong `city`, unknown `category`, half coordinates or coordinates outside the bbox, or a
`license` that does not match the `source`.

`data/cities.json`, the **cities manifest**: one entry per configured city (`cities/<slug>.toml`)
with a built corpus — `slug`, `name`, `aliases`, `centre`, `timezone`, `documents`, `built_at` —
sorted by slug and rebuilt whole after every build (`python -m city_corpus manifest` rewrites it
alone). `ai_api` reads its destinations from a copy packaged next to `airports.json`:
`just corpus-manifest` (run by `just corpus`) writes the file and copies it there, and an `ai_api`
test fails when the two differ. Adding a city therefore needs no deployment variable, only a corpus
and a new backend image.

### Readiness report

`report <slug>` reads `documents.jsonl` and writes `data/<slug>/report.md` (committed, for people)
and `report.json` (the same numbers for tooling): documents per category and source, listings vs
prose, places per category (a *place* is a document with a name; *located* when it has coordinates,
which is what becomes a planner card; *pictured* when a located place has an `image_url`), districts
with their located places and the ones under 10, `eat` and `sleep` by price tier, the twelve monthly
climate normals, and a few fixed smoke queries per category ("museum", "craft beer bar", "boutique
hotel", "free walking tour", ...; the same for every city) answered by a keyword scorer with the top three names, so a reader
sees at a glance whether the corpus answers.

The report ends with the **readiness gate**, the thresholds in `city_corpus/config/readiness.py`
(one place; change them there with the reason in the PR):

| Check | Threshold |
|---|---|
| Located `see` + `history` + `do` places | ≥ 150 |
| Located `eat` places | ≥ 100 |
| `sleep` documents / located `sleep` places | ≥ 20 / ≥ 10 |
| Districts | ≥ 5 |
| Pictured share of located `see` + `history` places | ≥ 50 % |
| Climate normals | = 12 |

Below any threshold the command exits 1 and prints the failing lines; `--no-gate` writes the
report and exits 0. A corpus that fails the gate is short of sources, not ready to index: add
Wikipedia categories, widen the bbox or lower the district admin level, rebuild, report again.

## Tours file

`curated/<city>/tours.toml` is the only hand-written input. One `[[tour]]` per public, scheduled tour:

```toml
[[tour]]
id = "jewish-quarter"                  # slug, stable: it becomes tour:<city>:<id>
name = "…"                              # as the operator calls it
operator = "…"
operator_url = "https://…"
url = "https://…"                       # the tour's own page (source_url and url)
tour_type = "walking"                   # walking | bike | boat | bus | cave | food | other
price_model = "tip-based"               # or "paid"
summary = "…"                           # our own words, ≥ 40 chars; never copied text
meeting_point = "…"
address = "…"                           # optional
lat = 47.4975                           # meeting point, inside the city bbox
lon = 19.0541
start_times = ["10:30", "14:00"]        # HH:MM, 24 h
days = "daily"
duration_minutes = 150
languages = ["English", "Spanish"]
booking_required = true                 # free registration needed; optional
checked = 2026-09-17                    # the day every fact was read on the operator's site
notes = "…"                             # for maintainers; not published

[reclassify]
include = [{ doc_id = "wv:en:Budapest#do:hungaria-koncert", tour_type = "boat" }]
exclude = []                            # doc_ids the automatic rule wrongly takes
```

To refresh: reopen each `url`, update what changed and set `checked` to that day. The build warns
about entries not checked for 180 days, and about `[reclassify]` ids no longer in the corpus. It fails
on malformed entries (bad times or URLs, unknown `tour_type`, a meeting point outside the city,
duplicate ids). Only public tours with a published schedule belong here, not private ones.

## Add a city

A city is one file, `cities/<slug>.toml` (`cities/budapest.toml` is the reference, commented). Nobody
writes it from scratch:

1. `just corpus-discover name="Bologna"` (or `uv run python -m city_corpus discover Bologna` here)
   writes `cities/bologna.draft.toml` from open sources and prints what it could not decide:
   * **Wikidata**: the city item (the first search hit that is located and in a country; a `# review`
     when its class is not a known city class), centre (P625), districts (P150, English labels), OSM
     relation (P402), Wikivoyage titles (sitelinks), Spanish label → `aliases`.
   * **Nominatim**: the relation's bounding box, rounded outwards to 0.01° (a 0.15° square around the
     centre, marked, when there is none).
   * **Open-Meteo**: the IANA time zone of the centre (`timezone=auto`; Wikidata's P421 names offsets,
     not zones).
   * **Overpass** (one tags-only query, the area selected by the OSM relation → `osm_relation`):
     administrative relations at levels 8–10; the level whose names look most like Wikidata's districts
     becomes `district_admin_level`, its relations the keys of `district_guides` (their `ref`, or their
     name when they carry none). Without a relation, `osm_area` must be the city's local OSM `name`
     (Wien, Praha) at admin level 8, and the draft marks it.
   * **Wikivoyage** en/es: the root article and its `Root/…` district pages → `include_subpages`. With
     district pages, `districts` are those pages and each OSM boundary maps to the page most like its
     name (`# review` when the match is weak or missing); without them, every boundary is its own district.
   * **Wikipedia** en: the standard categories that exist (`Tourist attractions in X`, `Museums in X`,
     `Bridges`, `Parks`, `Churches`, `Squares`, `Monuments and memorials`, `Buildings and structures`
     with `require_coordinates`, `Palaces`, `Towers`, `Thermal baths`, `Synagogues`, …), page counts as
     comments. Add the city's own categories by hand (`Category:` pages on Wikipedia).
2. Resolve every `# review` line, rename the file to `cities/<slug>.toml` (the `slug` must match the
   file name; drafts are ignored by the build) and delete what you do not want. A city with no
   Wikivoyage article or no standard category gets an empty `wikivoyage = []` / `categories = []` that
   still loads: fill them by hand. Unknown keys, a guide
   name that is not in `districts`, or a slug/file-name mismatch stop the build with the file and key.
3. For a new Wikivoyage language, add its section names to `SECTION_CATEGORIES` and its listing
   template names to `LISTING_TYPES` in `sources/wikivoyage.py`.
4. `just corpus city="<slug>"`: it builds, runs the readiness report and rewrites the cities
   manifest (with its `ai_api` copy). Iterate on the configuration until the gate passes, then
   commit `cities/<slug>.toml`, `data/<slug>/` (documents, manifest, report), `data/cities.json` and
   `src/backend/services/ai_api/ai_api/data/cities.json`. Optional curated tours go in
   `curated/<slug>/tours.toml` (or the path in `curated_tours`).

Wikidata folds its query service's lag into `maxlag`; a read-only request that gets such an answer is
re-sent without the parameter instead of waiting (the lag can sit at minutes for hours).

## Tests

`just test-corpus` (fixtures under `tests/fixtures/`, no network).
