# AGENTS.md — ai_api

Read [`backend/AGENTS.md`](../../AGENTS.md) first. `ai_api` owns everything that talks to language
models and retrieval. It has **no database** beyond the append-only trace log (ADR 0024) and never
imports `core_api`.

## Layout (ports and adapters)

```text
domain/         Message, ChatRole, Document, RetrievalFilters, GenerationParams, Usage, ChatTrace, ChatTurn, ThreadSaved,
                DayWeather, RouteSuggestion
                + Protocols: LLMProvider (stream + complete), Embedder, Retriever (search + fetch), WeatherForecast,
                TripGateway, ConversationGateway, TraceLog
                tracing.py: TurnTrace, Span, RetrievedDoc, EventMark, TurnContext (ADR 0024) and the read models
                TurnSummary, TurnDetail, TurnFilters, TurnPage (TRA-221)
application/    use cases (StreamChat, RecordConversation, PlanTrip, CardDetailLookup) and their pure helpers:
                structured.py (complete_json: JSON out of `LLMProvider.complete`, one repair retry), cards.py
                (OptionCard — and the fuller CardDetail — from a Document), validate.py (distance, load, closed,
                prices), language.py. Depend only on domain ports.
infrastructure/ adapters: nvidia_provider.py, bedrock_provider.py, bedrock_embedder.py, bedrock.py (shared by both
                Bedrock adapters), s3vectors.py + s3vectors_retriever.py, providers.py (settings → adapters),
                open_meteo.py (forecast), static_flight_search.py + data/airports.json (route deep links),
                cities.py + data/cities.json (the cities manifest the corpus tool writes; PLANNER_CITIES narrows it),
                commons_photos.py (a Wikimedia Commons photo near a venue and naming it, TRA-161),
                site_previews.py (the og:image a venue publishes on its own site, ADR 0021;
                its `GROUP_DOMAINS` — the hotel groups a brand domain may redirect to — is a copy
                of the corpus tool's `config/hotel_groups.py`, kept in step by hand, TRA-211),
                sse.py, retry.py, core_api_client.py
api/            deps.py (per-request wiring; process resources come from app.state), v1/endpoints/{chat,planner,admin,health}.py
schemas/        chat.py (request), planner.py (PlannerTurn request, PlannerCity, CardDetail), planner_events.py
                (SSE v2 events, ADR 0015), admin.py (trace pages, detail and stats responses)
openapi.py      puts the planner's stream models into the OpenAPI document (no route declares them)
main.py         lifespan builds the provider and the retriever once (providers.build_*) and closes them
indexing.py     CLI that fills the vector index from a corpus JSONL (just index); never runs in a request
prompts.py      every prompt string (system prompt, RAG context template, format_context)
testing.py      FakeProvider, FakeConversations, FakeEmbedder, FakeRetriever, KeywordRetriever (tf-idf over a corpus file),
                FakePhotoFinder, FakeSitePreviews + settings_for_tests()
```

- Routes live under `/api/v1/ai/*` so a proxy can route by prefix. Keep it that way.
- **Every request is traced (ADR 0024).** `application/tracing.py` (`TurnTracer`, `current_tracer`,
  `traced_llm_stream`), `application/record_trace.py` (writes before `[DONE]`),
  `application/pricing.py` (versioned USD per million tokens), `infrastructure/dynamo_traces.py`
  (`DynamoTraceLog`, `NullTraceLog` when `INTERACTIONS_TABLE` is empty; `testing.InMemoryTraceLog`
  in tests). Rules: every model call goes through `complete_json(name=..., template=...)` or
  `traced_llm_stream(...)`; every planner search through `PlanTrip._search(..., purpose=...)` (and
  every fetch through `_fetch`), whose results are recorded; the ids a pick keeps go through
  `tracer.note_picks` / `mark_used`; `tracer.phase(...)` is set before each phase's steps. A trace
  write never fails a turn. Never put the email in a trace; the subject is enough.
- **Admin reads (TRA-221).** `api/v1/endpoints/admin.py` under `/api/v1/ai/admin`: `GET /turns`
  (`session` → `list_session`, else `day` → `list_day`, else `subject` → `list_subject`; filters
  `kind`, `status`, `subject`, `trip_id`, `city`; opaque `cursor`), `GET /turns/{turn_id}`,
  `GET /sessions/{session_id}`, `GET /stats?start&end` (≤ 31 days, `application/trace_stats.py`,
  pure; the metric definitions are in its docstring and the README). The router depends on
  `audit_admin_read` → `require_admin` (`Forbidden` unless `principal.is_admin`), which logs
  `admin_read subject=… route=… target=…` before any read. The reads are `TraceLog` methods
  (`list_day`, `list_subject`, `list_session`, `get`, `iter_range`), implemented by
  `DynamoTraceLog`, `NullTraceLog` (finds nothing) and `testing.InMemoryTraceLog`
  (`testing.make_trace(**overrides)` builds a trace for tests). New fields on `TurnTrace` go to
  `TurnSummary` and `schemas/admin.py` too, then `just contracts`.
- Auth is **stateless**: `principal_from_token(token, settings)`; no user lookup. `AUTH_MODE` picks
  the issuer (local HS256 with `SECRET_KEY`, or the Cognito pool's RS256 ID tokens against
  `COGNITO_JWKS`); `tests/test_cognito_mode.py` covers the second with `CognitoTestIssuer`.
- Providers: `LLM_PROVIDER` picks NVIDIA (local, API key) or Bedrock (deployed, IAM role, no key;
  `converse_stream` through boto3, run in worker threads). Adding one: implement `LLMProvider` in
  `infrastructure/`, give it `name`, `is_configured` and `aclose()`, and add it to
  `providers.build_llm_provider`. The use case and the endpoint do not change. Sampling comes
  from `AISettings` (`CHAT_*`) as a `GenerationParams`, never from literals in the adapter; Bedrock
  sends only the temperature (Claude 4.5+ rejects it together with `top_p`).
- **Retrieval** (ADR 0014): `S3VectorsRetriever` over Amazon S3 Vectors, fed by `TitanEmbedder`,
  built in `lifespan` only when `RETRIEVAL_ENABLED` and injected by `get_stream_chat`. Another store
  is another `Retriever` in `infrastructure/` added to `providers.build_retriever`; never
  `core_api`'s database. A retrieval failure never fails the chat: `StreamChat` logs it and answers
  without context. Titan V2 accepts only `inputText`, `dimensions`, `normalize` (no `inputType`).
  An embedder reports tokens through the `Usage` it is handed, never through a counter of its own
  (no state between requests on Lambda).
- **The index is Terraform's, the vectors are ours.** `indexing.py` fills an existing index and
  never creates one. The non-filterable metadata keys are frozen by `infra/aws/vectors.tf`: keep
  `NON_FILTERABLE_KEYS` in `infrastructure/s3vectors.py` identical, and put new display fields in
  `extra` rather than a new key. Filterable keys can be added freely. Several filter conditions go
  inside `$and` (two keys side by side are an `Invalid filter`).
- **One index, many cities; a run touches one.** A corpus file is one city (the command refuses a
  mixed file) and the prune step deletes only that city's stale vectors, so `just index bologna`
  leaves Budapest as it was. Vectors without a `city` are never pruned (they are logged).
- **The cities come from the manifest, not from a variable.** `data/cities.json` (written by
  `city_corpus`, copied by `just corpus-manifest`, packaged next to `airports.json`) is read once in
  `lifespan` (`infrastructure/cities.py`); `PLANNER_CITIES` only narrows it for a local run. Adding a
  city = a new corpus + a new image, never a Terraform or env change. Never edit the copy by hand:
  `tests/test_cities_manifest.py` fails when it differs from the tool's file. The entry also carries
  what a trip overview shows — `intro` (the city's Wikivoyage lead per language, with its
  `source_url`) and `image_url`/`image_credit` (ADR 0017) — and `load_cities` tolerates an older
  manifest that has neither.
- The corpus contract is mirrored in `indexing.CorpusDocument`, never imported from `city_corpus`.
- Persisting planner results goes through `TripGateway` with the caller's token.
- **The planner (`POST /api/v1/ai/planner`, ADR 0015)** is `application/plan_trip.py`: stateless, driven by the
  request (brief + itinerary snapshot + transcript + message or `select`/`remove` action). Group ids carry their
  meaning (`nb`, `hotels:<district>`, `slot:<day>:<part>`) so a selection is read back without a session. The
  model only extracts the brief, ranks/picks ids among retrieved documents and writes `why`; cards come from
  `cards.py` over the document's metadata, ids not retrieved are dropped, `why` and titles go through
  `strip_prices`. It needs the retriever (503 without `RETRIEVAL_ENABLED`); a failed structured call degrades
  (top candidates, plain day titles, chat intent) rather than failing the turn. Prompts and the fixed
  en/es sentences live in `prompts.py`. **A place the ask names is offered first** (TRA-186):
  `_named_places` runs one unfiltered search on the traveller's words and pins the listings whose
  title the ask names (`_named_at`) ahead of the candidates and of the model's picks, on the options
  route and in `_chat`; a `restaurant` ask with no part searches `eat` *and* `drink`. Weather: Open-Meteo within 16 days, else the corpus's
  `om:climate:<city>:<MM>` normal fetched by id. **Every card is pictured, and never by another place**
  (TRA-161, TRA-168, TRA-206 / ADR 0021): candidates are ordered pictured-first; a card without a corpus
  image is looked up on Commons by name (the search carries the city's name) and at its coordinates,
  where a file still counts only when its title names the venue — the whole name in one phrase, both
  distinctive words, or the single one beside a word for a place to sleep (`choose_named`, the block
  the corpus tool holds word for word; TRA-208) — and, when it was found by name rather than by
  `geosearch`, only when Commons places it within 500 m of the venue (`PhotoFinder`,
  `PHOTOS_ENABLED`); failing that, a card with a `deep_link` shows the preview its own
  site publishes, credited with the bare domain (`SitePreviewFinder`, `SITE_PREVIEWS_ENABLED`); failing
  that, only a neighbourhood borrows — a pictured sight of its district, credited as that sight's
  (`PlanTrip._corpus_photo`); anything else gets the neutral placeholder credited `Illustrative photo`
  (`application/photos.py`). **A stay is always a pictured document** (TRA-208 / ADR 0022): the corpus
  resolves a photo for every hotel it keeps — the hotel's own site first, Commons by name only — so
  `_hotel_candidates` drops `sleep` documents without an
  `image_url` (searching twice as wide to make up for them) instead of falling back to a placeholder
  under "sleep here". Their credit travels with them: `image_credit` in the corpus — the bare domain the
  picture was read from — wins over the Commons author-and-licence line `cards.py` derives.
  Tests drive it with `FakeProvider(replies=[...])`,
  `FakeRetriever` (filter-aware), `FakePhotoFinder`, `FakeSitePreviews` and
  `testing.documents_from_corpus(tests/fixtures/budapest_sample.jsonl)`.
- **The planner knows no city by name.** `PlanTrip` takes `City` objects (`domain/models.py`) from the
  manifest; `resolve_city` matches a typed destination against every alias (ascii-folded whole words, so
  "Bolonia" is `bologna`), the brief prompt lists the covered spellings, the not-covered sentence names
  every covered city, and `GET /planner/cities` tells the page what to offer. A city name in code is a
  test fixture (`testing.city_for`, `testing.BUDAPEST`), never a default.
- SSE wire format to the browser is fixed (`data: {"content"}`, `data: {"thread_id"}`,
  `data: {"error", "error_code"}`, `data: [DONE]`); the frontend's `services/chat.ts` depends on it. Upstream bodies and unexpected
  exceptions never reach the client: `sse.py` sends the domain message or a generic one and logs the rest.
- **The planner's stream is typed (SSE v2, ADR 0015):** `schemas/planner_events.py` is a discriminated
  union on `type` (`text`, `brief`, `options`, `itinerary_patch`, `error`, `done`), ops on `op`, flat fields,
  **no field optional on the wire** (unknown → `null`; no defaults on the models, so the generated TypeScript
  has no `?`). Build events with the constructors at the bottom of that module (`text()`, `patch()`, ...),
  frame them with `sse.sse_events`. A streamed body has no response model, so `openapi.py` wraps
  `app.openapi()` and adds `PlannerEvent`, `ItineraryOp`, `PlannerTurn` and their models to
  `components.schemas`: any new event or op only needs to join the union, then `just contracts`.
- **Conversations live in `core_api`** (ADR 0013), never here: `ai_api` stays stateless and has no
  database. `RecordConversation` wraps the answer stream and, once the answer is complete, appends
  the question and the answer (sources, model, tokens, latency from `ChatTrace`) through
  `ConversationGateway` with the caller's token, then emits `ThreadSaved`. Recording must never
  break a chat: a failure is logged, the answer is already delivered, and an unusable thread is
  replaced by a new one. `CHAT_RECORD_CONVERSATIONS=false` switches it off.
- A provider fills the `Usage` it is handed (model and token counts) by the end of the stream, on
  top of logging it. That is what a recorded answer keeps.
- Retries happen only before any delta has been streamed; after that, fail in-band.

## Commands

```bash
uv run uvicorn ai_api.main:app --reload --port 8001
uv run pytest        # no network, no key: fakes for providers, embedder, retriever and boto3 clients
just index budapest [--dry-run]   # fills the S3 Vectors index; needs just aws-login
just planner-smoke budapest es     # real model + KeywordRetriever over the corpus, photo tally; NVIDIA_API_KEY, no AWS
```

Run the smoke session (README "Smoke session") after any change to the planner's prompts, cards or
photos, and paste its summary in the PR: the unit tests script the model, only this exercises it.

Env: `.env.example` (`LLM_PROVIDER`, `NVIDIA_API_KEY` or `BEDROCK_*`, `CORE_API_URL`,
`RETRIEVAL_*` / `VECTOR_*` / `EMBEDDINGS_*`, and the same
`AUTH_MODE`/`SECRET_KEY`/`COGNITO_*` as core_api). Every setting must be documented there
(`tests/test_env_example.py`).
