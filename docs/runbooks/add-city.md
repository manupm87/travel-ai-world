# Runbook — adding a city

The full runbook (discover the configuration, build, curate tours, smoke the planner, index) arrives
with the `/add-city` skill (TRA-170). This page holds the parts that already exist.

## Readiness report

A city corpus is ready to index when it passes the readiness gate. The gate is a command, not an
opinion:

```bash
just corpus city=<slug>            # builds data/<slug>/, then runs the report
just corpus-report city=<slug>     # the report alone; flags="--no-gate" to print without failing
```

It writes `src/backend/tools/city_corpus/data/<slug>/report.md` (commit it with the corpus) and
`report.json`, and exits 1 with the failing lines when a threshold is missed. The thresholds live in
`src/backend/tools/city_corpus/city_corpus/config/readiness.py` and are documented in the
[city_corpus README](../../src/backend/tools/city_corpus/README.md#readiness-report):
located sights, located restaurants, hotels, districts, pictured share of the sights, twelve
climate normals.

Read the report before opening the PR:

- **Smoke queries**: the top three names per query should be real places of the kind asked
  (a "thermal baths" answer that lists hotels means the `see` category is thin).
- **Districts**: they should read like neighbourhoods a traveller recognises, and none should be
  nearly empty (the report lists districts with fewer than 10 located places). Too many small ones
  → a coarser district admin level in the city configuration.
- **Pictured share**: below the threshold, more Wikipedia categories (Wikidata images come with
  them) beat anything else.

A failing gate is a configuration problem to fix and rebuild, never a reason to lower a threshold
for one city. If a threshold is wrong for every city, change it in `readiness.py` with the reason in
the PR.
