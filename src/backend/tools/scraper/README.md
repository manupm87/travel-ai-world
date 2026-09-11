# City scraper

Data ingestion scripts that turn a city into JSON files ready to be embedded for retrieval
(the future `Retriever` port of `ai_api`). Madrid is the configured city; another city is a
matter of changing the coordinates and the Wikipedia pages in `config/`.

Sources:

- **Google Places API (New)** for points of interest by category (bars, restaurants, hotels,
  museums, ...) around each zone in `config/city_zones.py`, filtered by the type lists in
  `config/categories.py`.
- **Wikipedia** for Metro, Cercanías and EMT stations, churches and palaces, and long-form
  "documentary" articles (history, culture, gastronomy, climate) listed in `config/info_documental.py`.
- **Fusion** steps merge the Google and Wikipedia records of the same station or monument.

## Run

```bash
cp .env.example .env         # GOOGLE_API_KEY (Google Places sources only)
just scrape                  # from the repo root; or, from this directory: uv run python main.py
```

`main.py` runs every step in sequence through `run_safe`, so one failing source does not stop the
pipeline. Output lands in `data/`, which is versioned so the team receives the source datasets and
the normalized corpus. `sources/resources/linesemt.csv` is the only static scraper input file.

## Normalize for retrieval

After the scraper JSON files are available in `data/`, generate the retrieval-ready Madrid corpus:

```bash
uv run python ingest.py
```

`ingest.py` reads the files explicitly listed in `SOURCE_FILES`. It deliberately uses the final
transport and monument files (`*_final.json`) and excludes intermediate Google and Wikipedia files,
which would otherwise duplicate records. The point-of-interest and documentary source files listed
there are already their final outputs.

The script writes one JSON object per line to `data/documents_madrid.jsonl`. Each object follows the
retrieval contract used by the future `ai_api` `Retriever` port:

```json
{
  "id": "restaurantes-ChIJ...",
  "content": "Natural-language text used to create an embedding.",
  "metadata": {
    "city": "Madrid",
    "category": "restaurantes",
    "source": "Google Places (New)",
    "source_file": "restaurantes_madrid.json"
  }
}
```

`content` combines the information that should be searchable semantically, such as a place name,
address, rating, amenities or transport lines. `metadata` preserves structured attributes for
filtering and traceability. Every generated document is checked for a non-empty unique `id`, a
non-empty `content`, and non-empty `city`, `category`, `source`, and `source_file` metadata.
The command fails before producing an accepted dataset if any of those checks fail.

### Add a city

Keep one normalized file per city, named `documents_<city>.jsonl`; for example,
`documents_barcelona.jsonl`. Do not merge cities into the same file: a later vector-store ingestion
job can read every `documents_*.jsonl` file while allowing one city to be regenerated or reindexed
independently.

To add a city, first create its scraper configuration and final source JSON files in `data/`. Then
adapt `ingest.py` for that city: set the output filename, replace `SOURCE_FILES` with its final JSON
files, and run the command above. Keep `metadata.city` in every document even though the output
filename identifies the city, because it will be needed as a retrieval filter. Do not add raw or
intermediate `*_google.json` and `*_wiki_*.json` files to `SOURCE_FILES` unless they are explicitly
the final source for a category.

## Layout

```text
main.py, ingest.py             pipeline order; JSON normalization for retrieval
config/  env.py               GOOGLE_API_KEY from .env
         city_zones.py        search centres (lat/lng) per zone
         categories.py        Google Places categories and type filters
         info_documental.py   Wikipedia pages to extract
core/    http_client.py, utils.py
sources/ scraper_general.py   generic Google Places engine (one function, any category)
         *_wiki.py, *_google.py, *_fusion.py   per-domain extractors and merges
         documentales.py, documental_general.py   Wikipedia article extraction
```

The scraper is a member of the backend uv workspace (`package = false`): same virtualenv, same
lockfile, same ruff rules, no image. Add dependencies in this `pyproject.toml`, then `uv lock` at
`src/backend/`.
