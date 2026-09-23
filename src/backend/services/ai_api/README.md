# ai_api

Everything that talks to language models: a streaming chat and a trip planner over NVIDIA-hosted
models (local development) or Amazon Bedrock (deployed), grounded in a corpus of city documents
searched in Amazon S3 Vectors. No database of its own besides the turn traces it writes to
DynamoDB (ADR 0024); authenticates with the bearer token alone (core_api's HS256 JWT
locally, the Cognito pool's RS256 ID token when deployed).

## Run

```bash
cp .env.example .env       # AUTH_MODE + SECRET_KEY or COGNITO_* (same as core_api), LLM_PROVIDER + NVIDIA_API_KEY or BEDROCK_*, CORE_API_URL
uv run uvicorn ai_api.main:app --reload --port 8001    # http://localhost:8001/api/v1/ai/docs
```

## Endpoints (`/api/v1/ai`)

| Method | Path | Auth | Notes |
|---|---|---|---|
| `POST` | `/chat` | Bearer | SSE stream: `data: {"content"}` ×n, `data: {"thread_id"}` when the exchange was recorded, `data: {"error", "error_code"}` on failure, `data: [DONE]` |
| `POST` | `/planner` | Bearer | The trip planner (ADR 0015): body `PlannerTurn` (message or `select`/`remove` action + brief + itinerary snapshot + transcript + `exclude_card_ids`); SSE v2 stream of typed events (`text`, `brief`, `options`, `itinerary_patch`, `error`) then `[DONE]`; 503 without `RETRIEVAL_ENABLED`. Every card carries a photo, and a stay carries a photo of itself: a `sleep` document without an `image_url` is never offered (the corpus resolves one for every hotel it keeps, [ADR 0022](../../../../docs/architecture/adr/0022-hotel-photos-resolved-at-build-time.md)) |
| `GET` | `/planner/cities` | Bearer | The cities the planner covers, from the manifest shipped with the service: `[{slug, name, centre: [lat, lon], timezone, intro, image_url, image_credit}]`. The page offers them as destinations and introduces the chosen one: `intro` is the city's description per language (`{en: {text, source_url}}`, from its Wikivoyage lead, CC BY-SA 4.0), `image_url` its photo on Commons and `image_credit` the line to print beside it (both `null` for a city whose TOML has no `[hero]`) |
| `GET` | `/planner/card?id=` | Bearer | One card in full (`CardDetail`): the `OptionCard` fields plus `description` (the corpus document's text, trimmed at a sentence boundary), `address`, `phone`, `website`, `heading_path`. The id is a corpus document id (slashes and colons, hence a query parameter); 404 when the index does not hold it, 503 without `RETRIEVAL_ENABLED`. Additive over `OptionCard` but not a replacement for one: `why` comes back empty (the model writes it per turn) and `image_url`/`image_credit` are the corpus's own (for a hotel, the photo and the credit line the build resolved, ADR 0022), a Commons lookup's or the venue's site preview (ADR 0021), `null` when none of the three has a photo — where the streamed card carries a fallback picture. A client holding the card merges the detail onto it (keeping that card's `why`, and its photo with its credit when the detail brings none) |
| `GET` | `/admin/turns` | Admin | Turns by `session` (oldest first), else `day` (`YYYY-MM-DD`), else `subject` (both newest first); filters `kind`, `status`, `subject`, `trip_id`, `city`; `cursor`, `limit` (1–200, 50). 400 without `day`, `subject` or `session`. See [Admin reads](#admin-reads-tra-221) |
| `GET` | `/admin/turns/{turn_id}` | Admin | One turn whole: `summary`, `context`, `spans` (by `seq`), `timeline`; 404 when unknown |
| `GET` | `/admin/sessions/{session_id}` | Admin | One planner draft's turns, oldest first; `cursor`, `limit` |
| `GET` | `/admin/stats?start=&end=` | Admin | Range stats (≤ 31 days, both included): per day, totals, by kind / model / city, RAG metrics, most and never used documents |
| `GET` | `/health/` | — | |
| `GET` | `/health/provider` | — | 503 when the active provider is not configured (no `NVIDIA_API_KEY`, or an empty `BEDROCK_CHAT_MODEL`); answers its `name` |

Request body: `{"message": "...", "history": [{"role": "user"|"assistant", "content": "..."}],
"thread_id": "..."}` (limits in `schemas/chat.py`; the system prompt is server-side and clients
cannot send one). `thread_id` is optional: without it the answer starts a new conversation and the
stream ends with the id to send back next time.

The planner's body (`schemas/planner.py`) has no optional field: every turn carries `message`,
`action`, `history`, `brief`, `itinerary`, `exclude_card_ids` and `trip_id`, `null` or empty when
there is nothing to say. Two of them drive the "Change" sheet (TRA-184). The page's own ask names
the slot and, after a colon, what the traveller wants instead:
`Alternatives for day 2 · afternoon: a thermal bath`
(`Alternativas para el día 2 · tarde: un baño termal` in Spanish), and that free text becomes the
retrieval query in place of the brief's interests. `exclude_card_ids` lists the cards that ask has
already shown (at most 60); they are spent exactly like the ones in the itinerary, so "More
options" brings three others rather than the same three.

**Not every card knows its day** (TRA-185, [ADR 0018](../../../../docs/architecture/adr/0018-chat-answers-carry-cards-client-names-the-slot.md)).
A group id carries the meaning of the carousel it names — `nb`, `hotels:<district>`,
`slot:<day>:<part>` — but two kinds of cards arrive placed nowhere, with `slot: null` and a fresh
`found:<8 hex>` id:

- the places a prose answer just named. Once a stay exists, `_chat` matches the passages it was
  grounded on (`is_place`, and the title present in the answer — the whole title case- and
  accent-folded, or every word `title_words` keeps) and sends up to five of them as cards in the
  order the answer named them, `why` empty because the prose above already explains them;
- a `find_options` ask that names no day ("is there something to do at Margaret Island?"): the
  cards come back unplaced instead of landing on day 1 by assumption.

**A place you name is offered first** (TRA-186). Before ranking anything, the turn runs one search
on the traveller's own words with no category filter and keeps the listings the ask names by name
(`_named_places`, the same folded, word-based match): they lead the carousel whatever the model
preferred, on the options route and on the chat one. A `restaurant` ask with no part of the day also
covers `drink`, so a wine bar, a pub or a ruin bar is reachable — "divino at gozsdu udvar" answers
with DiVino.

Then **the client names the slot**: `SelectAction.slot` (a `Slot`, or `null`) is the day and the
part the traveller chose, and `_on_select` reads `_slot_of_group(group) or action.slot`. Neither,
and the turn answers with the `stale_group` sentence, as it always did. A placed group sends
`null`; `nb` and `hotels:` are unaffected.

Full contract: [`docs/api/ai-api.openapi.json`](../../../../docs/api/ai-api.openapi.json).

## Layout (ports and adapters)

```text
ai_api/
├── main.py         lifespan: one provider (by LLM_PROVIDER) and, with RETRIEVAL_ENABLED, one retriever per process, on app.state
├── config.py       AISettings: LLM_PROVIDER, NVIDIA_*, BEDROCK_*, CHAT_*, RETRIEVAL_*, VECTOR_*, EMBEDDINGS_*, PLANNER_*, OPEN_METEO_*, PHOTOS_ENABLED, COMMONS_*, SITE_PREVIEW_*
├── prompts.py      CHAT_SYSTEM_PROMPT, RAG_CONTEXT_PROMPT, format_context(), the planner prompts and its fixed en/es sentences
├── openapi.py      registers the planner's stream models in the OpenAPI document (no route declares them)
├── indexing.py     python -m ai_api.indexing <documents.jsonl>: fills the vector index (just index)
├── domain/         models.py (Message, Document, RetrievalFilters, GenerationParams, Usage, ChatTrace, ChatTurn, DayWeather, RouteSuggestion) · ports.py (LLMProvider, Embedder, Retriever, WeatherForecast, TripGateway, ConversationGateway)
├── application/    stream_chat.py, record_conversation.py, plan_trip.py, card_detail.py — the use cases, depend only on ports · structured.py (JSON out of a completion) · cards.py · photos.py · validate.py · language.py
├── infrastructure/ nvidia_provider.py · bedrock_provider.py · bedrock_embedder.py · bedrock.py (client config and retry rules both Bedrock adapters share) · s3vectors.py (client, keys, metadata split) · s3vectors_retriever.py · providers.py (settings → adapters) · open_meteo.py · static_flight_search.py (+ data/airports.json) · cities.py (+ data/cities.json, the cities manifest the corpus tool writes) · commons_photos.py · site_previews.py (the image a venue publishes on its own site, ADR 0021; the corpus does the same for hotels at build time, ADR 0022) · sse.py · retry.py · core_api_client.py
├── api/            deps.py (wiring) · v1/endpoints/chat.py, planner.py, admin.py (trace reads, admins only), health.py
├── schemas/        chat.py · planner.py (PlannerTurn, PlannerCity, CardDetail) · planner_events.py (SSE v2 events and ops) · admin.py (trace pages, detail, stats)
└── testing.py      FakeProvider, FakeConversations, FakeEmbedder, FakeRetriever, documents_from_corpus(), settings_for_tests()
```

Swap the model: `NVIDIA_CHAT_MODEL` in `.env` (NVIDIA retires models without notice; a `410` from
the provider means pick another one on build.nvidia.com); `NVIDIA_THINKING=true` lets reasoning
models think first; tune sampling with `CHAT_*`. Swap the provider: `LLM_PROVIDER=nvidia|bedrock`; a
third one is a new class in `infrastructure/` implementing `LLMProvider`, added to
`providers.build_llm_provider`.

## Bedrock (`LLM_PROVIDER=bedrock`)

`infrastructure/bedrock_provider.py` streams through the Converse API (`converse_stream`) with
boto3. There is no API key: the Lambda's IAM role (Terraform, `infra/aws/lambda.tf`) or your SSO
session (`just aws-login`, `AWS_PROFILE`) signs the requests. `BEDROCK_CHAT_MODEL` and
`BEDROCK_TITLE_MODEL` are cross-region inference profiles (`eu.` prefix: Claude Haiku 4.5 for
answers, Amazon Nova Lite for short jobs such as conversation titles), so requests stay inside the
EU; `BEDROCK_REGION` is where the profile lives. Anthropic models need the one-time use-case form in
the Bedrock console before the first call (an `AccessDeniedException` in the logs means it is
missing). Only `CHAT_TEMPERATURE` is sent (Claude 4.5+ refuses `top_p` alongside it); retries follow
the same `RetryPolicy` as NVIDIA and happen only before the first delta.
`BedrockProvider.complete()` returns one non-streamed answer, optionally from another model
(`model=`), for the title generator. The final stream event's token usage is logged
(`Bedrock usage ...`) so costs can be reconciled with Cost Explorer.

## Retrieval (`RETRIEVAL_ENABLED`)

The chat grounds its answers in the city corpus that `tools/city_corpus` commits
(`data/<city>/documents.jsonl`), kept in an **Amazon S3 Vectors** index that Terraform creates
([ADR 0014](../../../../docs/architecture/adr/0014-vector-store-s3-vectors.md),
`infra/aws/vectors.tf`). For each question, `StreamChat` asks the `Retriever` for the
`RETRIEVAL_LIMIT` nearest passages and hands them to the model as a second system turn
(`prompts.format_context`: name · category · district, the text, the source link). Only the
question is embedded, not the history. The same passages are what the recorded answer keeps as its
`sources`.

- **Embeddings**: `bedrock_embedder.TitanEmbedder`, Titan Text Embeddings V2
  (`amazon.titan-embed-text-v2:0`, 1024 dimensions, normalised). The body is `inputText`,
  `dimensions` and `normalize` only: Titan refuses `inputType` (a Cohere parameter), so questions
  and passages are embedded the same way. It is multilingual: a Spanish question finds English
  Wikivoyage text.
- **Search**: `s3vectors_retriever.S3VectorsRetriever`, dense only, cosine. `RetrievalFilters`
  (city, districts, categories, kinds, maximum price tier, bounding box) become a metadata filter;
  S3 Vectors rejects two keys side by side, so several conditions travel inside `$and`, and it has
  no radius search, so an area is four comparisons on `lat`/`lon`.
- **Failure**: a store or embeddings error is logged and the chat answers from the model's own
  knowledge, as it did before retrieval. The flag off (the default) does the same without touching
  AWS.
- **Credentials**: the same chain as Bedrock — the Lambda's role in AWS, the SSO session
  (`just aws-login`, `AWS_PROFILE`) on a laptop. There is no emulator: locally, retrieval reads the
  deployed index.

### Filling the index

```bash
just aws-login
just index budapest                   # embeds, upserts by key, deletes what the file dropped
just index budapest --dry-run   # parse and measure only, no AWS
```

`python -m ai_api.indexing` reads the JSONL with its own model of the corpus contract (it never
imports `city_corpus`), stores each document under `uuid5(doc_id)` — ASCII and stable, so a second
run overwrites instead of duplicating — and, after a complete run, deletes the keys of that city
the file no longer has. One index holds every city: a file is one city (a mixed file is refused)
and a run never touches another city's vectors, so `just index bologna` leaves Budapest as it
was; vectors with no `city` metadata are logged, never pruned. The metadata is split as the index requires: filterable `city`, `category`,
`district`, `kind`, `lang`, `source`, `price_tier`, `lat`, `lon`, `tour_type`, `price_model`;
non-filterable `text`, `doc_id`, `name`, `url`, `source_url`, `heading_path` and `extra`, a JSON
string with every other field (images, licence, hours, price...). The non-filterable list is frozen
by the index (`infra/aws/vectors.tf`) and must match `infrastructure/s3vectors.py`; a new
filterable key needs no new index. Budapest: 6,330 documents, about 600k tokens, two minutes,
about 0.01 USD.

## Recorded conversations

Every answered exchange is kept in `core_api` (tables `chat_threads` and `chat_messages`,
[ADR 0013](../../../../docs/architecture/adr/0013-chat-conversations-in-core-api.md)): `ai_api` has
no database, so it posts them over HTTP with the caller's own token. The answer carries what it was
built on (the retrieved documents), the model, the token counts and how long it took, which is what
makes a test conversation reviewable afterwards.

The text is streamed first and recorded after, so nothing delays the answer. If `core_api` cannot
be reached the chat still answers and only logs a warning; if the given thread no longer exists, a
new one is started. `CHAT_RECORD_CONVERSATIONS=false` turns the whole thing off (useful when
running `ai_api` without `core_api`).

Errors: upstream status codes and bodies never reach the browser. A domain error mid-stream is sent
as `{"error": message, "error_code": CODE}`; anything unexpected is logged with its traceback and
sent as `{"error": "Chat stream failed", "error_code": "INTERNAL"}`.

## Turn traces (ADR 0024)

Every planner turn, chat answer and card detail leaves a trace in the DynamoDB table named by
`INTERACTIONS_TABLE` (`<prefix>-interactions` on AWS, `infra/aws/traces.tf`). The admin API reads
it ([Admin reads](#admin-reads-tra-221)).

| Item | `PK` | `SK` | Holds |
|---|---|---|---|
| Summary | `DAY#<YYYY-MM-DD>` | `<ts µs ISO>#<turn_id>` | kind, route, subject, `session_id`, `trip_id`, city, language, action, model, provider, `prompt_version`, tokens, `cost_usd` + `pricing_version`, latency, time to first event, status, counters, event and op counts, `sources` (≤ 200, with distance and `used`), previews |
| Context | `TURN#<turn_id>` | `CONTEXT` | the request (message or action, brief, snapshot ids, history), the answer text, the ops and option groups emitted |
| Step | `TURN#<turn_id>` | `SPAN#<seq>` | `kind` (`llm`, `retriever`, `tool`, `chain`), name, phase, parent, `t0_ms`, `dur_ms`, level, payload, results |
| Events | `TURN#<turn_id>` | `EVENTS` | the SSE timeline (text deltas collapsed) |

GSI1 is `SUBJECT#<subject>` (one user's turns), GSI2 `SESSION#<session_id>` (one planner draft,
sparse). Every item has `expires_at` (`INTERACTION_TTL_DAYS`, 90 by default).

- **How.** The endpoint builds a `TurnTracer` (`application/tracing.py`), makes it current for the
  request and wraps the stream with `RecordTrace` (`application/record_trace.py`), which writes the
  trace with `BatchWriteItem` *before* `[DONE]` (Lambda may freeze once the response ends). A write
  that fails is logged and never reaches the client; a client that goes away leaves a `cancelled`
  trace, best effort. Outside a request `current_tracer()` is a `NullTracer`: the use cases call it
  unconditionally and their unit tests need no fixture.
- **Phases** (`open`, `wardrobe`, `fold`, `weigh`, `zip`): reading the turn and the brief; weather,
  skeleton and the neighbourhood, hotel, named and chat searches; candidates and picks; validation,
  prices and photos; the closing text.
- **Used, without a judge.** The ids a pick keeps (and the ones `_fill` adds) are marked `used` on
  every retrieval that returned them; ids the model invented are the llm step's `dropped_ids`.
- **Caps and privacy.** 8 KB per text field (`TRACE_PAYLOAD_BYTES`, cut on a UTF-8 boundary), 200
  steps, 500 event marks, 200 sources, `truncated=true` beyond. The subject only, never the email.
- **Cost** comes from `application/pricing.py` (versioned); a model without a public price (NVIDIA)
  costs `null`. Embedding tokens are not measured yet: `Retriever.search` reports none.
- **Locally.** Empty `INTERACTIONS_TABLE` records nothing. Set it (`travel-ai-local-interactions`)
  with `DYNAMODB_ENDPOINT_URL` pointing at `just dynamodb-local` and `just dev-ai` creates the table
  at start-up; Compose (`just docker-up`) sets both for you.

### Admin reads (TRA-221)

`/api/v1/ai/admin/*` (`api/v1/endpoints/admin.py`) serves the traces to administrators: a token
whose principal `is_admin` (the Cognito group `admin`, ADR 0024; locally a token minted with
`--admin`). Everyone else gets `403`. Every read first logs one audit line,
`admin_read subject=<admin's subject> route=<path> target=<turn_id | session_id | ->`, the same
line `core_api`'s admin routes log.

- **Lists.** `day` reads the `DAY#` partition, `subject` GSI1, `session` GSI2. The other filters
  are a DynamoDB `FilterExpression`; since a filter may leave a query short, a page queries again
  from where it stopped (at most 10 round trips) and may come back with fewer than `limit` items
  and a cursor. The cursor is opaque (base64url of `LastEvaluatedKey`); a malformed one is `400`.
- **One turn.** The `TURN#` partition (context, events, steps) and then its summary. A step's
  `payload` holds its kind's keys — `llm`: provider, model, operation, schema, `prompt_version`,
  sampling, tokens, time to first chunk, attempts, repaired, validation error, `picked_ids`,
  `dropped_ids`, input and output; `retriever`: purpose, query, filters, `k`, ladder step, embedding
  model and tokens (the documents are in `results`); `tool`: service, host, status, count;
  `chain`: the code step's own counters.
- **Stats** (`application/trace_stats.py`, pure, over every summary of the range):
  - `days[]` / `totals`: turns, ok, errors, cancelled, tokens (input, output, embeddings),
    `cost_usd` (sum of the priced turns), `latency_p50_ms` / `latency_p95_ms` (nearest rank),
    `first_event_p50_ms`; every day is present, zeros when empty; `totals` adds distinct
    `subjects` and `sessions`.
  - `by_kind`, `by_model`, `by_city`: grouped and sorted by turns; no model or city is `unknown`.
  - `retrievals_per_turn`: retrievals / turns.
  - `no_hit_rate`: turns that searched and got no document / turns that searched (a proxy: the
    summary has no per-search hit count).
  - `used_over_retrieved`: Σ `docs_used` / Σ `docs_retrieved`.
  - `mean_distance_used`: mean distance of the used sources that have one.
  - `repair_rate`: turns with a repaired structured answer / turns that called a model.
  - `dropped_ids`: Σ ids a model picked that no retrieval offered.
  - `top_used`: the 20 documents used by most turns; `never_used`: 20 documents retrieved at least
    twice and never used.
  Ratios are `null` when their denominator is zero.

## Tests

```bash
uv run pytest      # FakeProvider + httpx.MockTransport: no network, no key
```

### Smoke session (real model, no AWS)

```bash
just planner-smoke budapest es          # or `en`; then flags such as --quiet --no-photos --days 3
uv run python tests/manual/planner_smoke.py --city budapest --lang en
```

`tests/manual/planner_smoke.py` drives `PlanTrip` the way the page does — opening message, dates,
a neighbourhood, a hotel, the alternatives of one slot, a restaurant request, a question — with the
NVIDIA model (`--model`, default `nvidia/nemotron-3-super-120b-a12b`), `testing.KeywordRetriever`
over the city's committed `tools/city_corpus/data/<city>/documents.jsonl`, the real Commons photo
lookup, the real preview of each venue's own site and the real Open-Meteo forecast. It prints each
turn's events and a summary (activities per day, where each photo came from — `corpus`, `commons`,
`site`, `illustrative`, `none` — duplicate ids or titles, prices that slipped into a card, seconds per
turn) and exits 1 on an unpictured activity or a price, 2 when the provider fails. Needs
`NVIDIA_API_KEY` in `.env`; about a minute. pytest never collects `tests/manual`.

For agents: [`AGENTS.md`](AGENTS.md).
