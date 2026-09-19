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
just corpus-discover name="Bologna"
```

Writes `src/backend/tools/city_corpus/cities/bologna.draft.toml` in about twenty seconds and prints
what it could not decide. The draft comes from:

| Source | What it decides |
|---|---|
| Wikidata | the city item (QID in the header), centre (P625), administrative districts (P150), the OSM relation (P402), the Spanish label → `aliases` |
| Nominatim | the relation's bounding box, rounded outwards |
| Open-Meteo | the IANA time zone of the centre |
| Overpass | the district boundaries at admin levels 8–10; the level whose names look most like Wikidata's districts becomes `district_admin_level` |
| Wikivoyage en/es | the root article and its `Root/…` district pages |
| Wikipedia en | which standard categories exist (`Tourist attractions in X`, `Museums in X`, `Churches`, `Palaces`, `Towers`, `Buildings and structures` …), with page counts as comments |

Open the draft and resolve every `# review` line: the item is the city and not the province, each
OSM boundary maps to the Wikivoyage district page that covers it (or to itself when the city has no
district pages), the categories are about places to visit (add the city's own from Wikipedia's
`Category:` pages; broad ones get `require_coordinates = true`, or they bring embassies and offices),
and `osm_area` is the local OSM name only when no `osm_relation` was found. Rename to
`cities/<slug>.toml`; drafts are never committed and never built. The loader refuses unknown keys, a
guide name missing from `districts`, a slug that differs from the file name.

## 3. Build and pass the readiness gate

```bash
just corpus city=<slug>            # build, then the readiness report, then the cities manifest
just corpus-report city=<slug>     # the report alone; flags="--no-gate" prints without failing
```

The build fetches serially, politely (User-Agent, `maxlag`, a five-second pause between Overpass
queries, backoff on 429), and caches every response in `.cache/`: a cold build takes five to ten
minutes, a warm one seconds and produces byte-identical files. `--offline` (as
`uv run python -m city_corpus build <slug> --offline` from the tool folder) proves it; deleting
`.cache/<host>/` refreshes one source.

A city corpus is ready to index when it passes the readiness gate. The gate is a command, not an
opinion: it writes `data/<slug>/report.md` (committed with the corpus) and `report.json`, and exits 1
with the failing lines when a threshold is missed. The thresholds live in
`src/backend/tools/city_corpus/city_corpus/config/readiness.py` and are documented in the
[city_corpus README](../../src/backend/tools/city_corpus/README.md#readiness-report): located
sights, located restaurants, hotels, districts, pictured share of the sights, twelve climate normals.

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

A failing gate is a configuration problem to fix and rebuild, never a reason to lower a threshold
for one city. If a threshold is wrong for every city, change it in `readiness.py` with the reason in
the PR. Write down every deviation from this page as you go: it belongs in the PR, and in this
runbook when the runbook was wrong.

## 4. Curated tours (optional)

`curated/<slug>/tours.toml`, following Budapest's file and the README's "Tours file": public,
scheduled tours read on each operator's own site (never resellers or aggregators), summaries in our
own words, `checked` set to the day the facts were read, meeting points inside the bbox. Rebuild
after adding it; the tours become documents and the automatic rule moves tour-like listings to the
`tour` category.

## 5. Smoke the planner

```bash
just planner-smoke city=<slug> lang=es
just planner-smoke city=<slug> lang=en
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

The PR carries `cities/<slug>.toml`, `data/<slug>/` (documents, manifest, report), the curated file
if any, both manifest copies, the report's Readiness table, both smoke summaries and the deviations.
`just lint`, `just test-corpus` and `just docs-check` pass; squash-merge when CI is green.

## 7. Index

```bash
just aws-login
just index city=<slug> flags=--dry-run   # parse and measure only, no AWS call
just index city=<slug>                   # embed, upsert by key, prune that city's stale vectors
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
leaves the manifest and, after a deploy, the planner). To empty its vectors, index the city once
more with a file holding only the documents to keep; an empty file is refused, so for a full removal
run `just index city=<slug> flags=--dry-run` to see the count, then delete the city's keys by hand
with the AWS CLI (`aws s3vectors list-vectors --return-metadata`, keep the keys whose `city` is the
slug, `delete-vectors`). `flags=--no-prune`
keeps stale vectors for a rehearsal.

## Known pitfalls

- **Overpass** answers 429, or a timeout inside a 200 body, when busy; the client waits and backs
  off. Never parallelise its queries.
- **Wikidata** folds its query service's lag into `maxlag`, and it can sit at minutes for hours;
  read-only requests are re-sent without the parameter. A stalled `discover` is usually this.
- **Broad Wikipedia categories** hold embassies, ministries and companies next to the sights;
  `require_coordinates = true` keeps the unlocated ones out.
- **Wikivoyage groupings** without a page image (`North Buda`, `East Pest`) take the photo of a
  pictured sight of the district for their card; three identical carousel photos mean the district
  has no pictured sight.
- **No Wikivoyage district pages** (Bologna): districts are the OSM boundaries at the level
  `discover` picked; the Wikivoyage listings get their district from those boundaries.
- **Local OSM names** (`Roma`, `München`, `Wien`) are covered by `osm_relation`; only a city with no
  relation on Wikidata needs `osm_area` typed by hand, in the local spelling.
- **More than 50 districts** (Prague, Istanbul) are fetched from Wikidata in batches; nothing to do.
