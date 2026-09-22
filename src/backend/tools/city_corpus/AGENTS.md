# AGENTS.md — city_corpus

Read [`src/backend/AGENTS.md`](../../AGENTS.md) first; what the tool does and its output
contract are in [README.md](README.md).

## Layout

```text
city_corpus/
├── cli.py               argparse: `build <city> [--sources] [--offline]`, `report <slug> [--no-gate]`,
│                        `discover "<name>"`, `manifest`
├── build.py             collect → validate → write documents.jsonl + manifest.json
├── manifest.py          data/cities.json: every configured city with a built corpus (ai_api ships a copy)
├── report.py            readiness report over documents.jsonl → report.md + report.json, gate
├── discover.py          draft cities/<slug>.draft.toml from Wikidata, Nominatim, Open-Meteo,
│                        Overpass (tags only), Wikivoyage and Wikipedia; `# review` marks
├── models.py            CorpusDocument (the ADR 0012 payload schema) and its enums
├── normalize.py         wikitext → text, chunking, slugs, wiki URLs, id de-duplication
├── http.py              ApiClient: User-Agent, maxlag, retries, on-disk cache
├── config/cities.py     CityConfig dataclasses + the strict TOML loader (CITIES = cities/*.toml)
├── config/hotel_groups.py  the hotel chains as data: group domains a brand may redirect to,
│                        brand-asset paths, and the name regex the report's notable list uses
├── config/readiness.py  Thresholds: the one place the readiness gate reads
└── sources/             one module per source (fetch + parse): wikivoyage.py, wikipedia.py,
                         osm.py (Overpass, merge/new), districts.py (boundaries, shapely),
                         neighbourhoods.py (district Wikipedia articles when Wikivoyage has no page),
                         wikidata.py (Wikidata + Commons licences), climate.py (Open-Meteo),
                         tours.py (curated tours + the `tour` reclassification rule),
                         curated_hotels.py (curated/<city>/hotels.toml: a hand-read hotel photo),
                         photos.py (a photo for every hotel, or the hotel goes: ADR 0022)
cities/<slug>.toml       one file per city (the configuration; drafts `*.draft.toml` are ignored)
curated/<city>/          hand-maintained inputs (tours.toml, hotels.toml); see README
                         "Tours file" and "Hotel photos file"
data/<city>/             committed output (source of truth for the vector store) + report.md/json
tests/                   fixtures only; never hit the network
```

## Rules

- **Deterministic output.** Same cache → byte-identical `documents.jsonl` and `manifest.json`: sort
  inputs, no wall-clock values except the cached fetch time, ids derived from content and page
  order. A change that alters ids re-keys the vector store; call it out in the PR.
- **`doc_id` is a contract** with the indexer and the planner's cards; keep its formats (README).
- **Curated tours are facts plus our own words**: read each fact on the operator's own site (not
  aggregators such as GuruWalk or Tripadvisor), never copy descriptions or photos, set `checked`.
  Rentals and public transport are not tours.
- **Curated hotel photos are read in a browser, on the hotel's own site**: `curated/<city>/hotels.toml`
  holds the URL of the picture the hotel publishes of itself, never a reseller's
  (booking.com, Expedia, Tripadvisor, Google) and never a file copied anywhere. `match` names one
  hotel, `checked` is the day someone looked, and the header lists the hotels left out and why.
  The report's "Notable hotels without a photo" is the worklist; the chain names behind it live in
  `config/hotel_groups.py`, never in a source module.
- **Licence-clean sources only**: Wikivoyage, Wikipedia, OpenStreetMap, Wikidata/Commons, Open-Meteo, curated files.
  Never add Google Places content, TripAdvisor or Booking data. Every document carries `source_url` and a
  `license` matching its source; images carry `image_license`/`image_author`, and non-free files are skipped.
  The one exception is a hotel's photo (ADR 0022): when Commons has none, `sources/photos.py` stores the
  URL the hotel publishes on its own site or Facebook page, credited by domain in `image_credit` and
  hot-linked, never copied. It applies to `sleep` only, and a hotel with no photo at all is dropped.
- **Be polite to Wikimedia and Overpass**: all requests go through `ApiClient` (serial, User-Agent,
  `maxlag`, per-host pauses, backoff, cache). Do not parallelize beyond 2 concurrent requests.
- **Enrichment never deletes or overwrites**: it fills empty fields only. Documents about the same place
  share `entity_id` instead of being merged.
- **A city is data**: `cities/<slug>.toml`, never a Python literal; start it with `just corpus-discover`
  and resolve every `# review` line. Nothing city-specific belongs in the source modules.
- **Regenerate and commit `data/`** when parsing changes, and paste the manifest counts in the PR.
- **The readiness gate is the definition of done for a corpus**: `just corpus-report <slug>`
  must pass before `just index`; commit `report.md` and `report.json` with the corpus. Change a
  threshold only in `config/readiness.py`, with the reason in the PR.
- Full ruff rule set and pyright apply here (unlike `tools/scraper`); `logging`, never `print`.
- Never import this package from a service; the indexer reads the JSONL file.
- Do not touch `tools/scraper/`.
