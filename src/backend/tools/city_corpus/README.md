# City corpus

Builds the knowledge base the trip planner retrieves from (epic TRA-136): licence-clean
documents about a city, normalized into one JSONL file that the indexer embeds and loads into
the vector store. The JSONL in `data/<city>/` is **committed and is the source of truth**; the
vector store holds a copy of each document in its payload.

Budapest is the configured city.

## Sources and licences

| Source | What | Licence |
|---|---|---|
| [en.wikivoyage.org](https://en.wikivoyage.org/wiki/Budapest) | `Budapest` and its 20 district guides (`Budapest/*`, redirects excluded): every listing template (`see`, `do`, `buy`, `eat`, `drink`, `sleep`, `go`, `listing`) and the prose of each section | CC BY-SA 4.0 |
| [es.wikivoyage.org](https://es.wikivoyage.org/wiki/Budapest) | The city page (mostly prose) | CC BY-SA 4.0 |
| [en.wikipedia.org](https://en.wikipedia.org/) | Articles in `Tourist attractions in Budapest`, `Museums in Budapest`, `Thermal baths in Budapest`, `Bridges in Budapest` | CC BY-SA 4.0 |

`Category:Baths in Budapest` (named in TRA-138) has no articles; the bath articles are in
`Category:Thermal baths in Budapest`. Google Places content, TripAdvisor and Booking are forbidden
sources (ToS). OpenStreetMap, Wikidata images and climate normals come in the enrichment step
(TRA-139).

## Run

```bash
just corpus                      # from the repo root (city="budapest")
# or, from this directory:
uv run python -m city_corpus build budapest [--sources wikivoyage,wikipedia] [--offline] [-v]
```

Every API response is cached in `.cache/` (ignored by git). A rebuild with a warm cache makes no
requests and writes byte-identical files; `--offline` fails on a cache miss instead of fetching.
Delete `.cache/` to pick up new page revisions. A cold build takes about 80 seconds (serial
requests, Wikimedia etiquette: descriptive User-Agent, `maxlag`, backoff).

## Output

`data/<city>/documents.jsonl`, one document per line:

| Field | Meaning |
|---|---|
| `doc_id` | Stable id: `wv:en:Budapest/Belváros#see:parliament-building` (listing), `wv:en:Budapest/Belváros#section:get-in/from-buda:c1` (prose chunk), `wp:en:3032195#s2-c1` (Wikipedia section 2, chunk 1). A repeated id gets `~2`, `~3` in page order |
| `city`, `district` | City slug; the Wikivoyage district guide (`null` for city-wide pages and Wikipedia) |
| `category` | `see`, `do`, `eat`, `drink`, `sleep`, `practical`, `history`, `transport`, `climate`, `neighbourhood` (Wikivoyage `buy` → `do`, `go` → `transport`) |
| `kind` | `listing` or `prose` |
| `name` | Listing or article name (`null` for Wikivoyage prose) |
| `text` | What gets embedded. Listings: name (alt), heading path, description, then address/directions/hours/price. Prose: heading path, blank line, chunk |
| `heading_path` | `Budapest › Belváros › Eat › Restaurants › Budget` |
| `lat`, `lon` | Both or neither, always inside the city bounding box |
| `hours`, `price`, `price_tier` | Listing facts; `price_tier` 1–3 from the Budget / Mid-range / Splurge section for eat, drink and sleep |
| `url`, `image_url`, `wikidata` | Official site; Commons thumbnail (filled by TRA-139); Wikidata id |
| `source`, `source_url`, `license`, `lang` | Attribution: `wikivoyage`/`wikipedia`, page URL with section anchor, `CC BY-SA 4.0`, `en`/`es` |

Listing extras, written only when present: `alt`, `address`, `directions`, `phone`, `checkin`,
`checkout`, `image` (Commons file name).

Prose is split by heading and chunked to at most 500 tokens (estimated as words × 1.3, heading
path included), repeating one paragraph between consecutive chunks; a short tail is folded into
the previous chunk. Wiki markup is stripped (link labels kept; inline templates such as
`{{station}}`, `{{HUF}}` or `{{km}}` rendered as text).

`data/<city>/manifest.json`: newest fetch time, counts per source, language, kind, category and
district, districts missing, skipped listings, and the revision id of every page used.

The build validates before writing and fails on: duplicate or empty `doc_id`, `text` under 40
characters, wrong `city`, unknown `category`, half coordinates or coordinates outside the bbox.

## Add a city

1. Add a `CityConfig` to `city_corpus/config/cities.py` (bbox, Wikivoyage root pages, Wikipedia
   categories, the district guide names the manifest should find).
2. For a new Wikivoyage language, add its section names to `SECTION_CATEGORIES` and its listing
   template names to `LISTING_TYPES` in `sources/wikivoyage.py`.
3. `just corpus city="<slug>"`, check `manifest.json`, commit `data/<slug>/`.

## Tests

`just test-corpus` (fixtures under `tests/fixtures/`, no network).
