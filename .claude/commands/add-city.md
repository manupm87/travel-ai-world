Add a city to the planner: draft its configuration from open sources, build and gate its corpus,
smoke the planner over it, open the PR. Human version with the reasoning and the costs:
`docs/runbooks/add-city.md`. Everything but the last step (indexing, which needs an AWS session)
is yours to do.

Usage: `/add-city <City name>` (the English name, e.g. `/add-city Bologna`)

Steps:

1. **Issue and branch.** Create the Linear issue `<City> through the pipeline` (team "Travel AI
   World", project "AI & Data", parent epic TRA-164 while it is open) unless one exists, then:

   ```bash
   git checkout main && git pull --ff-only && git checkout -b feat/TRA-<n>-city-<slug>
   ```

   `<slug>` is the lowercase ASCII name (`bologna`, `sao-paulo`). Move the issue to In Progress.

2. **Draft the configuration.**

   ```bash
   just corpus-discover "<City name>"
   ```

   It writes `src/backend/tools/city_corpus/cities/<slug>.draft.toml` from Wikidata (item, centre,
   districts, OSM relation, aliases), Nominatim (bbox), Open-Meteo (time zone), Overpass (district
   boundaries and their admin level), Wikivoyage en/es (root article, district pages) and Wikipedia
   (the standard categories that exist, with page counts), and prints what it could not decide.
   About 20 s. Open the draft and resolve **every** line marked `# review`:
   - the Wikidata item is the city, not a province or a metro area (the QID is in the header);
   - `district_guides`: each OSM boundary maps to the Wikivoyage district page that covers it, or
     to itself when the city has no district pages (then `districts` are the OSM boundaries);
   - `[wikipedia] categories`: keep what is about places to visit; add the city's own categories
     from Wikipedia (`Category:` pages: palaces, towers, baths, cemeteries…); set
     `require_coordinates = true` on any broad category (`Buildings and structures in X` holds
     embassies and offices);
   - `osm_area` only matters when `osm_relation` is missing: then it must be the local OSM `name`
     (`Wien`, `Praha`), not the English one;
   - `aliases`: the draft folds the labels to ASCII; a name whose letters fold away (Łódź → `odz`)
     needs the common ASCII spelling added by hand (`lodz`), and the Spanish exonym when there is
     one (`bolonia`, `múnich`/`munich`);
   - `[hero]`: the photo the trip overview shows, drafted from the city's Wikidata image (P18) when
     Commons licenses it freely. Open `https://commons.wikimedia.org/wiki/File:<file>` and look at
     it: keep it only if it is a skyline or a famous landmark, otherwise pick a better free photo
     on Commons and write its file name and credit
     (`"{author} ({licence}) · Wikimedia Commons"`). The table is optional; delete it to ship no
     photo.

   Every command below is `just <recipe> <arg> …`: `just` has no `name=value` arguments, so
   `just corpus city=<slug>` would build the literal "city=<slug>". `just -n <recipe> <args>` prints
   what a recipe would run.

   Rename the file to `cities/<slug>.toml` (drafts are ignored by the build; `slug` must equal the
   file name). Do not commit a `.draft.toml`.

3. **Build and pass the gate.**

   ```bash
   just corpus <slug>
   ```

   Builds `data/<slug>/` (5–10 min cold: serial, polite requests to Wikimedia and Overpass, all
   cached in `.cache/`), then runs the readiness report and rewrites the cities manifest and its
   `ai_api` copy. The report is the definition of done: it exits 1 with the failing lines. Read
   `data/<slug>/report.md` and iterate on the TOML until every check passes:
   - short of located sights → more Wikipedia categories (they bring Wikidata images too), a wider
     `bbox`, a second Wikivoyage language;
   - short of districts (≥ 5) → a finer `district_admin_level`; a city that really has fewer
     administrative districts is a finding for `config/readiness.py` (say so in the PR), never a
     reason to invent districts;
   - districts that do not read like neighbourhoods a traveller knows → a coarser level, or the
     Wikivoyage district pages as `district_guides`;
   - smoke queries answering with the wrong kind of place (hotels under "museum") → the category is
     thin: sources, not thresholds;
   - short of curated tours or tour documents → step 4; the gate does not pass without them.

   A rebuild with a warm cache is byte-identical; `--offline` (as
   `uv run python -m city_corpus build <slug> --offline` from the tool folder) proves it. To refresh
   one source, delete `.cache/<host>/` for that host only. Write down every deviation from these
   steps: it goes in the PR and, if it was the runbook's fault, in this file.

4. **Curated tours (required: the gate needs ≥ 3 curated tours).** `curated/<slug>/tours.toml`,
   following `curated/budapest/tours.toml` and the README's "Tours file". How to find them:
   - Search the web for "<city> free walking tour", "free tour <city>", "<city> food tour",
     "<city> bike tour" and the city's signature walk (porticoes, castle, river). For every
     candidate find the **operator's own website** and read the tour page there.
   - Discard marketplaces and resellers, whatever they call themselves: GuruWalk, Freetour.com,
     Civitatis, GetYourGuide, Viator, Tripadvisor, Airbnb Experiences, Musement, Tiqets, and
     franchises that resell local guides (SANDEMANs, Walkative!) unless the franchise's own site
     runs the tour. Discard operators whose own site publishes no start time, days or meeting
     point ("upon reservation" is not a schedule), and private or on-request tours.
   - For each kept tour record the name as the operator writes it, operator, operator URL, tour
     URL, `tour_type`, `price_model`, `start_times`, `days`, `duration_minutes`, `languages`,
     meeting point and address, `booking_required`, `checked` = today; write the `summary` in your
     own words (≥ 40 characters, never copied). Meeting point coordinates come from Nominatim
     (`https://nominatim.openstreetmap.org/search?q=<landmark>&format=json`, with a User-Agent),
     inside the bbox. Keep the header comment: what was left out and why.
   - Aim for every tip-based walking tour operator with its own site plus the notable paid ones
     (food, bike, the signature walk). Fewer than three genuine operators is a finding for the
     PR, not a reason to list a reseller.
   Rebuild after adding it (`just corpus <slug>`); the report's Tours section lists what landed.

5. **Smoke the planner.** Needs `NVIDIA_API_KEY` in `src/backend/services/ai_api/.env`; no AWS.

   ```bash
   just planner-smoke <slug> es
   just planner-smoke <slug> en
   ```

   Each run (about a minute) drives a whole session over the new corpus with the real model and the
   real Commons photo lookup and prints a summary. Pass = exit 0: every activity pictured, no price
   in a card, no duplicate ids. Check by hand in the event log: three **distinct** neighbourhood
   photos, districts named like real neighbourhoods, hotels in the chosen district, days that read
   like a route. A failing run is a corpus problem first (go back to step 3), a prompt problem
   second (that is a separate ticket, not this one).

6. **PR.** Commit `cities/<slug>.toml`, `data/<slug>/` (documents, manifest, report), the curated
   file if any, `data/cities.json` and `src/backend/services/ai_api/ai_api/data/cities.json` (CI
   fails when the two copies differ). Run `just lint`, `just test-corpus`, `just docs-check`. The PR
   body follows `.github/pull_request_template.md`, carries `Closes TRA-<n>`, the report's
   Readiness table, both smoke summaries and the deviations. Comment the PR URL on the issue. Merge
   when CI is green (squash).

7. **After the merge, hand over.** Tell Manuel the two things only he can do, in this order:
   1. `just aws-login && just index <slug>` — embeds the corpus and upserts it into the shared
      S3 Vectors index; it prunes only that city's stale vectors, other cities are untouched.
      `just index <slug> --dry-run` first parses and measures without touching AWS.
   2. A backend deploy: the cities manifest ships inside the `ai_api` image, so the planner offers
      the city only after "Backend images" has built the merge commit and "Deploy backend" has
      promoted it (`docs/runbooks/deploy.md`, "Promoting a backend change": `gh workflow run
      deploy-backend.yml -f cloud=aws -f image_tag=<full sha> -f apply=false`, then `apply=true`).
      No Terraform change and no environment variable. The frontend needs no deploy.

   After both, `/plan/` plans "4 días en <city> desde Madrid" with the new city's cards.

Known pitfalls (from Budapest and Bologna):

- **Overpass** answers 429 or a timeout in a 200 body when busy: the client waits 5 s between
  queries and backs off; a cold build is slow by design. Never parallelise the requests.
- **Wikidata** folds its query service's lag into `maxlag` and it can sit at minutes for hours;
  read-only requests are re-sent without the parameter. If the discover run stalls, that is why.
- **Wikipedia broad categories** hold embassies, ministries and companies next to the sights:
  `require_coordinates = true` keeps the unlocated ones out. Airports and stations are recognised by
  their title and filed as `transport`. Check the smoke queries and the smoke session's day picks
  for the rest: a sight that is not one is a category problem, and the fix is a rule in
  `sources/wikipedia.py` that every city gets, not an edit to one corpus.
- **Standard categories are a list**: a category you add by hand that any city may have (Bologna's
  `Basilica churches in X`, `Gates of X`, `Renaissance architecture in X`) goes into
  `STANDARD_CATEGORIES` in `discover.py` too, so the next city's draft probes it.
- **Wikivoyage groupings** (`North Buda`, `East Pest`) have no page image: their neighbourhood card
  takes the photo of a pictured sight in the district. Three identical carousel photos mean the
  district has no pictured sight: more Wikipedia categories.
- **No Wikivoyage district pages** (Bologna): districts come from the OSM boundaries at the level
  `discover` picked; the Wikivoyage listings get their district from those boundaries, and each
  district's `neighbourhood` text comes from its Wikipedia article (the boundary's `wikidata` tag;
  the local language when there is no English one). The gate needs ≥ 5 districts with one; a
  boundary without a `wikidata` tag has no text and no card, so tag it in OSM or pick another
  admin level.
- **Local OSM names**: `osm_relation` (from Wikidata P402) selects the area, so `Roma`, `München`
  and `Wien` need nothing by hand. Without a relation, `osm_area` must be the local name.
- **More than 50 districts** (Prague, Istanbul) are fetched in batches; nothing to do.
- **The one index is shared with production**: `just index` is Manuel's step, never yours.
