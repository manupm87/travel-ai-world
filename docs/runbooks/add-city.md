# Runbook — adding a city

A city is data: one TOML file describes where its documents come from, a build turns the open
sources into a committed corpus, a report says whether that corpus is good enough to plan with, and
a manifest tells the service which cities exist. Nothing in the backend or the frontend names a city.
Claude Code runs the whole sequence with `/add-city <name>`; this page is the same sequence with
the reasoning, for a person. One step needs an AWS session (indexing) and is done by hand.

Budapest is the reference: `src/backend/tools/city_corpus/cities/budapest.toml` (commented),
`data/budapest/` (corpus, manifest, report) and `curated/budapest/tours.toml`.

## 1. Issue and branch

Every city is a Linear issue (`<City> through the pipeline`) and a branch `feat/TRA-<n>-city-<slug>`
from an up-to-date `main`. The slug is the lowercase ASCII name (`bologna`, `sao-paulo`).

## 2. Draft the configuration

```bash
just corpus-discover "Bologna"
```

Writes `src/backend/tools/city_corpus/cities/bologna.draft.toml` in about twenty seconds and prints
what it could not decide. The draft comes from:

| Source | What it decides |
|---|---|
| Wikidata | the city item (QID in the header), centre (P625), administrative districts (P150), the OSM relation (P402), the Spanish label → `aliases`, the country (P17) and its ISO 3166-1 alpha-2 code (P297) → `country` / `country_code` |
| Nominatim | the relation's bounding box, rounded outwards |
| Open-Meteo | the IANA time zone of the centre |
| Overpass | the district boundaries at admin levels 8–10; the level whose names look most like Wikidata's districts becomes `district_admin_level` |
| Wikivoyage en/es | the root article and its `Root/…` district pages |
| Wikipedia en | which standard categories exist (`Tourist attractions in X`, `Museums in X`, `Churches`, `Palaces`, `Towers`, `Buildings and structures` …), with page counts as comments |
| Wikidata + Commons | `[hero]`, the city's photo for the trip overview: the P18 image when Commons licenses it freely, with the credit line the page prints |

Open the draft and resolve every `# review` line: the item is the city and not the province, each
OSM boundary maps to the Wikivoyage district page that covers it (or to itself when the city has no
district pages), the categories are about places to visit (add the city's own from Wikipedia's
`Category:` pages; broad ones get `require_coordinates = true`, or they bring embassies and offices),
and `osm_area` is the local OSM name only when no `osm_relation` was found. `country` and
`country_code` are mandatory and the loader checks the code is two upper-case letters: a country
Wikidata gives no P297 for arrives empty and marked `# review`. **Open the `[hero]`
photo** (`https://commons.wikimedia.org/wiki/File:<file>`) before keeping it: it is the picture the
trip overview shows, so it must be a skyline or a well-known landmark under a free licence, not an
interior, a map or a coat of arms. Replace `file` and `credit` with a better Commons photo when it
is poor (the credit is `"{author} ({licence}) · Wikimedia Commons"`); drop the table to ship no
photo — it is optional and the gate ignores it. Rename to
`cities/<slug>.toml`; drafts are never committed and never built. The loader refuses unknown keys, a
guide name missing from `districts`, a slug that differs from the file name.

## 3. Build and pass the readiness gate

```bash
just corpus <slug>            # build, then the readiness report, then the cities manifest
just corpus-report <slug>     # the report alone; add --no-gate to print without failing
```

The build fetches serially, politely (User-Agent, `maxlag`, a five-second pause between Overpass
queries, backoff on 429), and caches every response in `.cache/`: a cold build takes 25 to 55
minutes, a warm one seconds and produces byte-identical files. `--offline` (as
`uv run python -m city_corpus build <slug> --offline` from the tool folder) proves it; deleting
`.cache/<host>/` refreshes one source, and `.cache/sites/` the venues' own pages.

Most of that time is the **photo stage** (ADR 0022): every hotel with coordinates and no picture
is looked up through the preview of its own site, then its Facebook page, then Wikimedia Commons
by name, then the largest picture on its homepage. Two things to expect from it, both by design:

- **Hotels leave the corpus.** One that none of the four sources pictures is dropped — roughly a
  third of them, almost all with a dead or parked website. A stay is the one card the traveller
  is asked to commit to, so the planner offers no stay it cannot show. The report's **Hotels**
  section names what went and where the rest of the photos came from.
- **It runs long and mostly waits.** Run it in the background and watch the log
  (`-v` logs a line per hotel); never build two cities at once (Overpass).

A city corpus is ready to index when it passes the readiness gate. The gate is a command, not an
opinion: it writes `data/<slug>/report.md` (committed with the corpus) and `report.json`, and exits 1
with the failing lines when a threshold is missed. The thresholds live in
`src/backend/tools/city_corpus/city_corpus/config/readiness.py` and are documented in the
[city_corpus README](../../src/backend/tools/city_corpus/README.md#readiness-report): located
sights, located restaurants, hotels (and how many of them are pictured), districts, pictured
share of the sights, twelve climate normals.

Read the report before opening the PR:

- **Smoke queries**: the top three names per query should be real places of the kind asked (a
  "museum" answer that lists hotels means the `see` category is thin).
- **Districts**: they should read like neighbourhoods a traveller recognises, and none should be
  nearly empty (the report lists districts with fewer than 10 located places). Too many small ones
  → a coarser district admin level; too few (the gate needs five) → a finer one. A city that really
  has fewer administrative districts is a finding about the thresholds, to be argued in the PR, not
  a reason to invent districts.
- **Pictured share**: below the threshold, more Wikipedia categories (Wikidata images come with
  them) beat anything else.
- **Hotels**: the gate wants ten pictured stays. A city that misses it has hotels whose websites
  the build could not read at all — widen the bbox or check that OpenStreetMap carries their
  `website` tags, then run the **full** build again: with `.cache/` warm only the photo stage
  costs time. Never rerun `--sources photos` alone — a partial `--sources` build writes only
  what those stages produce, which would leave the corpus with nothing but its hotels.

A failing gate is a configuration problem to fix and rebuild, never a reason to lower a threshold
for one city. If a threshold is wrong for every city, change it in `readiness.py` with the reason in
the PR. Write down every deviation from this page as you go: it belongs in the PR, and in this
runbook when the runbook was wrong.

## 4. Curated tours (required)

Tours are part of the readiness gate (≥ 3 curated tours, ≥ 3 `tour` documents): no open source
lists them, so every city ships `curated/<slug>/tours.toml`, following Budapest's file and the
README's "Tours file". Public, scheduled tours only, read on each operator's own site.

How to find them: search "<city> free walking tour", "free tour <city>", "<city> food tour",
"<city> bike tour" and the city's signature walk; for each candidate open the **operator's own
website** and read the tour page there. Discard marketplaces and resellers (GuruWalk, Freetour.com,
Civitatis, GetYourGuide, Viator, Tripadvisor, Airbnb Experiences, Musement, Tiqets; SANDEMANs or
Walkative! when they resell local guides), operators whose own site publishes no start time, days
or meeting point ("upon reservation" is not a schedule), and private or on-request tours. For each
kept tour record the name as the operator writes it, operator and tour URLs, type, price model,
start times, days, duration, languages, meeting point and address, whether booking is required
and `checked` = the day the facts were read; the summary is in our own words, never copied.
Meeting point coordinates come from Nominatim for the landmark the operator names, inside the
bbox. The file's header comment lists what was left out and why, so the next refresh does not
re-research it. Aim for every tip-based walking tour operator with its own site plus the notable
paid ones (food, bike, the signature walk); fewer than three genuine operators is a finding for
the PR, not a reason to list a reseller.

Rebuild after adding it; the tours become documents, the automatic rule moves tour-like listings
to the `tour` category, and the report's Tours section shows what landed.

## 5. Smoke the planner

```bash
just planner-smoke <slug> es
just planner-smoke <slug> en
```

Needs `NVIDIA_API_KEY` in `src/backend/services/ai_api/.env`; no AWS; about a minute each. The
script drives a whole session over the committed corpus (opening message, dates, a neighbourhood, a
hotel, the alternatives of one slot, a restaurant request, a question) with the real model, a keyword
retriever over the file, the real Commons photo lookup and the real forecast, and prints a summary:
activities per day, photo source per card, duplicate ids or titles, prices that slipped into a card,
seconds per turn. Exit 0 is the pass. Then look at the log with your own eyes: three distinct
neighbourhood photos, districts named like real neighbourhoods, hotels in the chosen district, days
that read like a route. A failing run is a corpus problem first; a prompt problem is its own ticket.

## 6. Cities manifest and the PR

`just corpus` ends by rewriting `src/backend/tools/city_corpus/data/cities.json` (every configured
city with a built corpus: slug, name, aliases, centre, time zone, document count) and copying it to
`src/backend/services/ai_api/ai_api/data/cities.json`, which ships in the backend image and is where
the planner takes its destinations from. Commit both copies; CI fails when they differ. A new city
therefore needs a backend deploy after the merge (the manifest is inside the image), but no
Terraform change and no environment variable.

There is **no map step**: the planner's map reads OpenFreeMap's global tiles from the browser and
centres itself on the `centre` the manifest already carries (ADR 0016). Nothing per city is built,
uploaded or configured.

The PR carries `cities/<slug>.toml`, `data/<slug>/` (documents, manifest, report), the curated file
if any, both manifest copies, the report's Readiness table, both smoke summaries and the deviations.
`just lint`, `just test-corpus` and `just docs-check` pass; squash-merge when CI is green.

## 7. Index

```bash
just aws-login
just index <slug> --dry-run   # parse and measure only, no AWS call
just index <slug>                   # embed, upsert by key, prune that city's stale vectors
```

One S3 Vectors index holds every city. A run reads one city's file (a mixed file is refused),
upserts its documents and deletes only the vectors of **that** city the file no longer mentions:
Budapest is untouched by a Bologna run. The index is the one production reads, which is why this
step is done by hand, after the merge, with the committed file.

**Cost.** Titan V2 embeddings cost about 0.01 USD per 6,000 documents; S3 Vectors storage and
queries for a city are cents per month. Adding a city is not a budget decision.

## 8. Deploy

The manifest ships in the `ai_api` image, so the planner offers the new city once the merge commit
has been built and promoted: [deploy runbook](deploy.md), "Promoting a backend change" (wait for
"Backend images", then "Deploy backend" with the full commit SHA, `apply=false` to see the plan,
`apply=true` to promote). The frontend lists the cities from the service and needs no deploy of its
own. Then `/plan/` plans "4 días en <city> desde Madrid" with the new city's cards.

## Rollback

Delete `cities/<slug>.toml` and `data/<slug>/`, run `just corpus-manifest` and commit (the city
leaves the manifest and, after a deploy, the planner). To shrink its vectors, index the city once
more with a file holding only the documents to keep (the prune removes the rest of that city). An
empty file removes nothing: the run exits 0 having done nothing, and the prune never runs. A full
removal is therefore done by hand with the AWS CLI: `aws s3vectors list-vectors --return-metadata`,
keep the keys whose `city` is the slug, `delete-vectors` in batches of 500 (or a follow-up recipe).
`just index <slug> --dry-run` shows the count first; `just index <slug> --no-prune` keeps stale
vectors for a rehearsal.

## Known pitfalls

- **Overpass** answers 429, or a timeout inside a 200 body, when busy; the client waits and backs
  off, and reads for up to 250 s (a big city's query outlasts a minute). Never parallelise its
  queries. A build that gives up keeps the queries it finished in `.cache/`: run it again.
- **Small memorials** (Stolpersteine, plaques) carry a name and a website in OSM and would flood
  `see` (Berlin: 6,504 of them); the OSM source skips them. Look at the report's `see` count: a
  city several times Budapest's usually means another such tag, fixed in `sources/osm.py`.
- **Windows**: set `PYTHONUTF8=1` (the commands print `→` and names like `Neukölln`, which the
  console's cp1252 cannot encode).
- **Wikidata** folds its query service's lag into `maxlag`, and it can sit at minutes for hours;
  read-only requests are re-sent without the parameter. A stalled `discover` is usually this.
- **Broad Wikipedia categories** hold embassies, ministries and companies next to the sights;
  `require_coordinates = true` keeps the unlocated ones out, and articles named after an airport or a
  station are filed as `transport`. A category that any city may have goes into `discover`'s
  standard list, so the next draft probes it.
- **Wikivoyage groupings** without a page image (`North Buda`, `East Pest`) take the photo of a
  pictured sight of the district for their card; three identical carousel photos mean the district
  has no pictured sight.
- **No Wikivoyage district pages** (Bologna): districts are the OSM boundaries at the level
  `discover` picked; the Wikivoyage listings get their district from those boundaries, and each
  district's `neighbourhood` text comes from its Wikipedia article through the boundary's `wikidata`
  tag (Italian for Bologna's quartieri: no English article exists). The gate needs ≥ 5 districts
  with such a document; a boundary without a `wikidata` tag has no text and no card.
- **Names that fold away in ASCII** (Łódź → `odz`): add the common ASCII spelling (`lodz`) and the
  Spanish exonym to `aliases` by hand.
- **`just` has no named arguments**: `just corpus city=<slug>` builds the literal "city=<slug>".
  Positional only; `just -n <recipe> <args>` shows what would run.
- **Local OSM names** (`Roma`, `München`, `Wien`) are covered by `osm_relation`; only a city with no
  relation on Wikidata needs `osm_area` typed by hand, in the local spelling.
- **More than 50 districts** (Prague, Istanbul) are fetched from Wikidata in batches; nothing to do.
