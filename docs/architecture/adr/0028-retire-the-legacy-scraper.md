# 0028 — The legacy scraper leaves the tree

**Status:** Accepted
**Date:** 2026-10-03

Updates [ADR 0004](0004-repository-layout.md), which made the scraper a workspace member.
TRA-276; decision D2 of the [audit of 2026-09-27](../code-quality-review-2026-09-27.md)
(TOOL-6).

## Context

`src/backend/tools/scraper/` held the first Madrid ingestion scripts: points of interest and
transport from Google Places and Wikipedia, written out as JSON under its `data/`. The planner no
longer gets anything from it:

- **The cities come from `tools/city_corpus`**: licence-clean documents from Wikivoyage,
  Wikipedia, OpenStreetMap, Wikidata and Open-Meteo, committed as JSONL and indexed into S3
  Vectors ([ADR 0014](0014-vector-store-s3-vectors.md)). Nothing read the scraper's JSON.
- **It versioned Google Places data** (`hoteles_madrid.json` and other files under `data/`), which
  the corpus's licence policy forbids (`tools/city_corpus/AGENTS.md`).
- It still cost something on every change: a workspace member in the lockfile
  (`beautifulsoup4`, `soupsieve`), its own ruff policy (E/F only), a line in the Dockerfile, the
  `just scrape` recipe and an `.env` copied by `just setup`, an entry in `scripts/release.py`, two
  required files in `scripts/check_docs.py`, and lines in every layout description.

## Decision

- **`tools/scraper` is deleted**, with everything that referred to it: the `just scrape` recipe
  and the `scraper` variable of the `justfile`, its `.env` in `just setup`, its ruff per-file
  policy, its `COPY` line in the Dockerfile, its manifest in `scripts/release.py`, its required
  files in `scripts/check_docs.py`, and its mentions in the READMEs, AGENTS files and runbooks.
  `uv lock` drops `city-scraper` and the packages only it used.
- The git history keeps the code and its data; nothing is rewritten.
- **`tools/vector_store_bench` and `infra/gcp` stay**, by team decision (2026-10-03). The same
  audit proposed removing them too (D3, D4); they are not part of this change.

## Consequences

- One workspace member, one recipe and one lint exception fewer; `tools/` holds `city_corpus`
  and `vector_store_bench`.
- The Google Places files are no longer on `main`. They remain in the history, as the audit
  accepted ("the history keeps it").
- A new city goes through `tools/city_corpus` only ([add-city runbook](../../runbooks/add-city.md)).
- ADR 0004 and the dated audit reports still describe the scraper; they are historical records.
  ADR 0004 carries a pointer here.
