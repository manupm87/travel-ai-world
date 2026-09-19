# AGENTS.md — ai_api

Read [`backend/AGENTS.md`](../../AGENTS.md) first. `ai_api` owns everything that talks to language
models and retrieval. It has **no database** and never imports `core_api`.

## Layout (ports and adapters)

```text
domain/         Message, ChatRole, Document, RetrievalFilters, GenerationParams, Usage, ChatTrace, ChatTurn, ThreadSaved,
                DayWeather, RouteSuggestion
                + Protocols: LLMProvider (stream + complete), Embedder, Retriever (search + fetch), WeatherForecast,
                TripGateway, ConversationGateway
application/    use cases (StreamChat, RecordConversation, PlanTrip) and their pure helpers: structured.py
                (complete_json: JSON out of `LLMProvider.complete`, one repair retry), cards.py (OptionCard from a
                Document), validate.py (distance, load, closed, prices), language.py. Depend only on domain ports.
infrastructure/ adapters: nvidia_provider.py, bedrock_provider.py, bedrock_embedder.py, bedrock.py (shared by both
                Bedrock adapters), s3vectors.py + s3vectors_retriever.py, providers.py (settings → adapters),
                open_meteo.py (forecast), static_flight_search.py + data/airports.json (route deep links),
                commons_photos.py (a Wikimedia Commons photo near a venue, TRA-161),
                sse.py, retry.py, core_api_client.py
api/            deps.py (per-request wiring; process resources come from app.state), v1/endpoints/{chat,planner,health}.py
schemas/        chat.py (request), planner.py (PlannerTurn request), planner_events.py (SSE v2 events, ADR 0015)
openapi.py      puts the planner's stream models into the OpenAPI document (no route declares them)
main.py         lifespan builds the provider and the retriever once (providers.build_*) and closes them
indexing.py     CLI that fills the vector index from a corpus JSONL (just index); never runs in a request
prompts.py      every prompt string (system prompt, RAG context template, format_context)
testing.py      FakeProvider, FakeConversations, FakeEmbedder, FakeRetriever, KeywordRetriever (tf-idf over a corpus file) + settings_for_tests()
```

- Routes live under `/api/v1/ai/*` so a proxy can route by prefix. Keep it that way.
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
- The corpus contract is mirrored in `indexing.CorpusDocument`, never imported from `city_corpus`.
- Persisting planner results goes through `TripGateway` with the caller's token.
- **The planner (`POST /api/v1/ai/planner`, ADR 0015)** is `application/plan_trip.py`: stateless, driven by the
  request (brief + itinerary snapshot + transcript + message or `select`/`remove` action). Group ids carry their
  meaning (`nb`, `hotels:<district>`, `slot:<day>:<part>`) so a selection is read back without a session. The
  model only extracts the brief, ranks/picks ids among retrieved documents and writes `why`; cards come from
  `cards.py` over the document's metadata, ids not retrieved are dropped, `why` and titles go through
  `strip_prices`. It needs the retriever (503 without `RETRIEVAL_ENABLED`); a failed structured call degrades
  (top candidates, plain day titles, chat intent) rather than failing the turn. Prompts and the fixed
  en/es sentences live in `prompts.py`. Weather: Open-Meteo within 16 days, else the corpus's
  `om:climate:<city>:<MM>` normal fetched by id. **Every card is pictured** (TRA-161): candidates are ordered
  pictured-first, a card without a corpus image is looked up on Commons at its coordinates (`PhotoFinder`,
  `PHOTOS_ENABLED`) and, failing that, gets an illustrative photo of its category credited as such
  (`application/photos.py`). Tests drive it with `FakeProvider(replies=[...])`, `FakeRetriever` (filter-aware),
  `FakePhotoFinder` and `testing.documents_from_corpus(tests/fixtures/budapest_sample.jsonl)`.
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
just index city=budapest [flags=--dry-run]   # fills the S3 Vectors index; needs just aws-login
just planner-smoke city=budapest lang=es     # real model + KeywordRetriever over the corpus, photo tally; NVIDIA_API_KEY, no AWS
```

Run the smoke session (README "Smoke session") after any change to the planner's prompts, cards or
photos, and paste its summary in the PR: the unit tests script the model, only this exercises it.

```bash
```

Env: `.env.example` (`LLM_PROVIDER`, `NVIDIA_API_KEY` or `BEDROCK_*`, `CORE_API_URL`,
`RETRIEVAL_*` / `VECTOR_*` / `EMBEDDINGS_*`, and the same
`AUTH_MODE`/`SECRET_KEY`/`COGNITO_*` as core_api). Every setting must be documented there
(`tests/test_env_example.py`).
