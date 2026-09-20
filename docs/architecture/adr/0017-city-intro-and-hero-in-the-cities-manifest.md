# 0017 — A city's intro and hero photo travel in the cities manifest

**Status:** Accepted
**Date:** 2026-09-20

## Context

The planner's trip overview (TRA-177) introduces the destination: a photo of the city and a
paragraph about it, beside the itinerary. `GET /api/v1/ai/planner/cities` answered with slug,
name, centre and time zone only, so the page had nothing to show and no licence line to print.

Both pieces already exist, in different places. The description is in the corpus: the lead of the
city's Wikivoyage article is a document of every built corpus
(`wv:en:Budapest#section:intro:c1`, one per `[[wikivoyage]]` language), with its own `source_url`
and `license`. A picture of the whole city is not: the corpus holds photos of *places*, and the
one image that means "this city" is the Wikidata P18 of the city item — a choice that needs a
human eye (P18 is sometimes an interior, a map or a coat of arms) and a licence check.

The alternatives were to stream them as planner events (the page would wait for the model to
answer before it could render the header, for content that never changes between trips), to fetch
them in `ai_api` at request time (a Commons and a Wikivoyage call per page view, cached nowhere),
or to let the page call Wikipedia itself (a third-party request from the browser, and the
attribution would live in the UI instead of the data).

## Decision

Both fields travel in the cities manifest, `data/cities.json`, which the corpus tool writes and
`ai_api` ships in its image (`just corpus-manifest` copies it; a test fails when the two differ).
`city_entry()` adds:

- `intro`: `{ "<lang>": { "text", "source_url" } }`, **derived** at manifest time from the built
  corpus — for every `[[wikivoyage]]` site, the document `wv:<lang>:<root>#section:intro:c1` of
  `data/<slug>/documents.jsonl`, its first line (the article title) dropped and the rest cut at
  the last sentence that fits in 600 characters, paragraph breaks kept. A language without such a
  document is absent.
- `image_url` and `image_credit`: **curated** in `cities/<slug>.toml`, in a new optional `[hero]`
  table (`file`, a Commons file name without `File:`, and `credit`). The URL is built with the
  same `Special:FilePath` helper the documents' thumbnails use, at 1200 px.

`python -m city_corpus manifest` therefore stays offline and deterministic: it reads files the
repository already holds and makes no request, so no corpus rebuild is needed to gain the fields.
`discover` drafts `[hero]` from the city's P18 after asking Commons for the licence
(`fetch_image_info` + `is_free`) and marks the table `# review` when there is no free image; the
human who adds a city looks at the picture (the add-city runbook says so).

`ai_api` carries them through unchanged: `City.intro/image_url/image_credit` in the domain,
`PlannerCity.intro: dict[str, CityIntro]`, `image_url`, `image_credit` on the wire. `load_cities`
tolerates an entry without the keys, so an older manifest still loads.

## Consequences

- The page renders the destination header from data it already has after `/planner/cities`; no
  extra request, nothing to wait for in the stream, and the same content for every trip.
- Attribution ships with the content: the Wikivoyage text keeps its `source_url` (CC BY-SA 4.0,
  the page links it) and the photo its `image_credit` (author and licence, `· Wikimedia Commons`).
- The intro follows the corpus. A rebuild that changes the lead changes the manifest, and
  `just corpus-manifest` must run (it does, as part of `just corpus`).
- A hero photo is a human decision per city, which is one more `# review` line when adding one.
  It is optional on purpose: the readiness gate does not ask for it, and a city without `[hero]`
  answers `null`/`null` instead of blocking.
- 600 characters is a display choice living in `manifest.py`; changing it rewrites `cities.json`
  for every city. If the overview later wants the full lead, the field to widen is this one — not
  a new call from the page.
