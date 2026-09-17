# AGENTS.md — city_corpus

Read [`src/backend/AGENTS.md`](../../AGENTS.md) first; what the tool does and its output
contract are in [README.md](README.md).

## Layout

```text
city_corpus/
├── cli.py               argparse: `build <city> [--sources] [--offline]`
├── build.py             collect → validate → write documents.jsonl + manifest.json
├── models.py            CorpusDocument (the ADR 0012 payload schema) and its enums
├── normalize.py         wikitext → text, chunking, slugs, wiki URLs, id de-duplication
├── http.py              ApiClient: User-Agent, maxlag, retries, on-disk cache
├── config/cities.py     CityConfig per city
└── sources/             wikivoyage.py, wikipedia.py (fetch + parse, one module per source)
data/<city>/             committed output (source of truth for the vector store)
tests/                   fixtures only; never hit the network
```

## Rules

- **Deterministic output.** Same cache → byte-identical `documents.jsonl` and `manifest.json`: sort
  inputs, no wall-clock values except the cached fetch time, ids derived from content and page
  order. A change that alters ids re-keys the vector store; call it out in the PR.
- **`doc_id` is a contract** with the indexer and the planner's cards; keep its formats (README).
- **Licence-clean sources only** (Wikivoyage, Wikipedia, and the open sources of TRA-139). Never add
  Google Places content, TripAdvisor or Booking data. Every document carries `source_url` and `license`.
- **Be polite to Wikimedia**: all requests go through `ApiClient` (serial, User-Agent, `maxlag`,
  backoff, cache). Do not parallelize beyond 2 concurrent requests.
- **Regenerate and commit `data/`** when parsing changes, and paste the manifest counts in the PR.
- Full ruff rule set and pyright apply here (unlike `tools/scraper`); `logging`, never `print`.
- Never import this package from a service; the indexer reads the JSONL file.
- Do not touch `tools/scraper/`.
