# AGENTS.md — ai_api

Read [`backend/AGENTS.md`](../../AGENTS.md) first. `ai_api` owns everything that talks to language
models and retrieval. It has **no database** beyond the append-only trace log (ADR 0024), the
daily token counters (ADR 0026) and the admin's evaluation runs (ADR 0039), all in the same table,
and never imports `core_api`. Endpoints,
settings and the evaluations are described in [`README.md`](README.md).

## Layout (ports and adapters)

```text
domain/         Message, ChatRole, Document, RetrievalFilters, GenerationParams, Usage, DayWeather, RouteSuggestion
                agent.py: ToolSpec, ToolCall, ToolResult, AgentMessage and the converse stream items
                TextDelta, ToolCallReady, StepEnd (ADR 0032)
                + Protocols: LLMProvider (stream + complete + converse), Embedder, Retriever (search + fetch), WeatherForecast,
                PhotoFinder, SitePreviewFinder, TraceLog, UsageStore, EvalStore, AccessGateway, InputGuard
                (check → GuardVerdict)
                evaluation.py: EvalRunRecord, EvalItemRecord, EvalRunDetail (the admin's evaluation runs, ADR 0039)
                usage.py: DailyUsage, Entitlement, resets_at (ADR 0026)
                tracing.py: TurnTrace, Span, RetrievedDoc, EventMark, TurnContext (ADR 0024) and the read models
                TurnSummary, TurnDetail, TurnFilters, TurnPage
application/    use cases (PlanTrip in plan_trip.py, CardDetailLookup in card_detail.py, CheckAccess in
                access.py) and their pure helpers:
                structured.py (complete_json: provider-constrained JSON, one attempt; deterministic use-case fallback), cards.py
                (OptionCard — and the fuller CardDetail — from a Document), validate.py (distance, load, closed,
                prices), photos.py (the placeholder), language.py, retrieval_eval.py (recall@k / MRR over the
                20 questions per city of data/eval_questions/), answer_eval.py (the chat's answers to those
                questions and to data/eval_unanswerable.jsonl, graded by a judge model; the chat prompt is
                `plan_trip.chat_messages`, a grounded-answer prompt outside the agent), judge_validation.py
                (the judge alone over data/eval_judge_golden.jsonl: agreement and Cohen's kappa),
                eval_runs.py (EvalRuns: the admin's runs of those two, stored and streamed, ADR 0039),
                conversation_eval.py (scripted multi-turn scenarios of data/eval_conversations/ played against
                `PlanTrip`, the page's side mirrored by `ClientState` from `plannerReducer.ts`, graded on the
                itinerary and texts they leave). Depend on domain
                ports and on `schemas/` (the use cases emit the
                wire events, ADR 0015); `plan_trip.py` also imports the pure `static_flight_search.route_for`.
                agent/schema.py (`tool_schema`: a tool's Pydantic input as JSON Schema, optional fields kept
                optional, ADR 0032), agent/context.py (system prompt + transcript), agent/tools.py
                (AgentContext, the tools, Toolbox), agent/loop.py (run_agent, ProseFilter): Kiri, the
                agent; they import plan_trip, which imports them inside `_agent`.
infrastructure/ adapters: nvidia_provider.py, bedrock_provider.py, bedrock_embedder.py, bedrock.py (shared by both
                Bedrock adapters), s3vectors.py + s3vectors_retriever.py, providers.py (settings → adapters),
                open_meteo.py (forecast), static_flight_search.py + data/airports.json (route deep links),
                cities.py + data/cities.json (the cities manifest the corpus tool writes; PLANNER_CITIES narrows it),
                commons_photos.py (a Wikimedia Commons photo near a venue and naming it),
                site_previews.py (the og:image a venue publishes on its own site, ADR 0021;
                every hop, the image's included, must be http(s) on the scheme's default port
                to a name whose every resolved address is public (`is_public_address`);
                its `GROUP_DOMAINS` — the hotel groups a brand domain may redirect to — is a copy
                of the corpus tool's `config/hotel_groups.py`, kept in step by hand),
                bedrock_guard.py (BedrockInputGuard: ApplyGuardrail on the traveller's message, fail open;
                NullInputGuard when BEDROCK_GUARDRAIL_ID is empty),
                sse.py, retry.py, core_api_client.py (AccessGateway),
                dynamo_traces.py, dynamo_usage.py (the daily token counters, same table),
                dynamo_eval.py (the admin's evaluation runs and their lock, same table)
api/            deps.py (per-request wiring; process resources come from app.state), v1/endpoints/{planner,usage,admin,health}.py
schemas/        chat.py (ChatMessage, the transcript's limits), planner.py (PlannerTurn request, PlannerCity, CardDetail), planner_events.py
                (SSE v2 events, ADR 0015), admin.py (trace pages, detail and stats responses), answer_eval.py
                (the evaluation runs, their items and stream events), usage.py
config.py       AISettings: LLM_PROVIDER, NVIDIA_*, BEDROCK_*, CHAT_*, RETRIEVAL_*, VECTOR_*, EMBEDDINGS_*, PLANNER_*,
                JUDGE_*, OPEN_METEO_*, PHOTOS_ENABLED, COMMONS_*, SITE_PREVIEW_*, INTERACTION*, TRACE_PAYLOAD_BYTES,
                ACCESS_CONTROL_ENABLED, ACCESS_CACHE_SECONDS
openapi.py      puts the stream models (the planner's, the evaluation runs') into the OpenAPI document
main.py         lifespan builds the provider and the retriever once (providers.build_*) and closes them
indexing.py     CLI that fills the vector index from a corpus JSONL (just index); never runs in a request
prompts.py      every prompt string (RAG context template, format_context, the planner's prompts)
testing.py      FakeProvider, FakeEmbedder, FakeRetriever, KeywordRetriever (tf-idf over a corpus file),
                FakePhotoFinder, FakeSitePreviews, FakeInputGuard, InMemoryTraceLog, InMemoryUsageStore, FakeAccessGateway,
                documents_from_corpus() + settings_for_tests()
```

- Routes live under `/api/v1/ai/*` so a proxy can route by prefix. Keep it that way.
- **Every request is traced (ADR 0024).** `application/tracing.py` (`TurnTracer`, `current_tracer`,
  `traced_llm_stream`, `traced_converse`, `tool_span`), `application/record_trace.py` (writes before `[DONE]`),
  `application/pricing.py` (versioned USD per million tokens), `infrastructure/dynamo_traces.py`
  (`DynamoTraceLog`, `NullTraceLog` when `INTERACTIONS_TABLE` is empty; `testing.InMemoryTraceLog`
  in tests). Rules: every model call goes through `complete_json(name=..., template=...)` or
  `traced_llm_stream(...)`; every agent step goes through `traced_converse(...,
  traveller_message=...)` (an `llm` span, `operation="agent"`, with `tools`, `tool_calls` and
  `stop_reason`) and every tool it runs through `tool_span(tracer, name, arguments)` (a `tool`
  span `tool:<name>`, `service="planner"`; the caller sets `status` and `count`); every planner search through `PlanTrip._search(..., purpose=...)` (and
  every fetch through `_fetch`), whose results are recorded; the ids a pick keeps go through
  `tracer.note_picks` / `mark_used`; `tracer.phase(...)` is set before each phase's steps. A trace
  write never fails a turn. Never put the email in a trace; the subject is enough.
- **Admin reads.** `api/v1/endpoints/admin.py` under `/api/v1/ai/admin`: `GET /turns`
  (`session` → `list_session`, else `day` → `list_day`, else `subject` → `list_subject`; filters
  `kind`, `status`, `subject`, `trip_id`, `city`; opaque `cursor`), `GET /turns/{turn_id}`,
  `GET /sessions/{session_id}`, `GET /stats?start&end` (≤ 31 days, `application/trace_stats.py`,
  pure; the metric definitions are in its docstring and the README). The router depends on
  `audit_admin_read` → `require_admin` (`Forbidden` unless `principal.is_admin`), which logs
  `admin_read subject=… route=… target=…` before any read (`admin_write` for `POST /answer-eval`). The reads are `TraceLog` methods
  (`list_day`, `list_subject`, `list_session`, `get`, `iter_range`), implemented by
  `DynamoTraceLog`, `NullTraceLog` (finds nothing) and `testing.InMemoryTraceLog`
  (`testing.make_trace(**overrides)` builds a trace for tests). New fields on `TurnTrace` go to
  `TurnSummary` and `schemas/admin.py` too, then `just contracts`. `POST /retrieval-eval`
  runs `application/retrieval_eval.run` over every city with the app's retriever
  (`deps.require_retriever`: 503 when retrieval is off) and answers the report; it stores and
  traces nothing and counts no tokens against anyone. `POST /answer-eval` is the one admin route
  that writes, and only its own runs (ADR 0039): `application/eval_runs.EvalRuns` stores the run
  `running`, streams `progress` per item through `sse_events`, then writes the run `done` or
  `failed` before `report`; 409 while another run is in progress. The judge is
  `deps.get_judge` (`providers.build_judge_provider`: Bedrock, `JUDGE_MODEL`), the answering
  model `deps.get_eval_answerer` (production's Bedrock model whatever `LLM_PROVIDER` says), the
  store `deps.get_eval_store` (`DynamoEvalStore`, `NullEvalStore`, `testing.InMemoryEvalStore`).
  Runs are not traced and count no tokens against anyone.
- **Access and the daily token quota (ADR 0026).** A route that spends tokens declares
  `dependencies=[Depends(require_budget)]`; a planner read declares `require_access`
  (`api/deps.py`). A new route under `/planner` needs one of the two; admin and health
  routes need neither. Both ask `CheckAccess` (`application/access.py`), built once in `lifespan`
  (`app.state.check_access`: it holds the per-subject cache of `core_api`'s
  `GET /users/me/access`, `ACCESS_CACHE_SECONDS`), and do nothing with `ACCESS_CONTROL_ENABLED`
  off. Errors are `AccessDenied` (403) and `DailyTokenLimit` (429, extras `limit`, `used`,
  `resets_at`) from `travel_common`, raised before the `StreamingResponse` exists. The counter is
  `UsageStore` (`infrastructure/dynamo_usage.py`: `USAGE#<subject>` / `DAY#<day>`, one atomic
  `UpdateItem ADD`; `NullUsageStore` without a table; `testing.InMemoryUsageStore`), fed by
  `RecordTrace(log, usage)` for every trace that spent a token, whatever became of the trace
  write. Only input + output tokens count; the limit is soft and approximate (checked before,
  counted after: turns in flight all finish). Both writes go through `RecordTrace._write` (usage first, shielded from
  cancellation): never await `_record` directly from a stream path.
  Closed when `core_api` cannot be asked, open when the counter cannot be read. Reads:
  `GET /usage/me`, `GET /admin/usage?day=`. Never import `core_api` for any of it.
- Auth is **stateless**: `principal_from_token(token, settings)`; no user lookup. `AUTH_MODE` picks
  the issuer (local HS256 with `SECRET_KEY`, or the Cognito pool's RS256 ID tokens against
  `COGNITO_JWKS`); `tests/test_cognito_mode.py` covers the second with `CognitoTestIssuer`.
- Providers: `LLM_PROVIDER` picks NVIDIA (local, API key) or Bedrock (deployed, IAM role, no key;
  `converse_stream` through boto3, run in worker threads). Adding one: implement `LLMProvider` in
  `infrastructure/`, give it `name`, `is_configured` and `aclose()`, and add it to
  `providers.build_llm_provider`. The use case and the endpoint do not change. Sampling comes
  from `AISettings` (`CHAT_*`) as a `GenerationParams`, never from literals in the adapter; Bedrock
  sends only the temperature (Claude 4.5+ rejects it together with `top_p`). `complete_json` passes
  the JSON Schema to Bedrock Converse and to NVIDIA GLM-5.3-Flash (`response_format`); unsupported
  NVIDIA models use the prompt instruction and tolerant parser. Structured calls make one attempt;
  the use case owns the deterministic fallback. GLM structured calls set low reasoning effort and
  clear hidden thinking to leave room for the answer.
  **Tool use (ADR 0032)**: `converse(system, messages, tools, *, usage)` streams `TextDelta`s, one
  `ToolCallReady` per complete call and exactly one `StepEnd`; `supports_tools` is a verified model
  set (`TOOL_USE_MODELS`: Bedrock's Haiku 4.5 EU profile; NVIDIA's Nemotron 3 Super, the one
  model `tests/manual/converse_probe.py` passed for, GLM-5.3-Flash timed out). Bedrock sends
  `toolConfig` on every step and never a blank text block; NVIDIA sends OpenAI `tools` and assembles
  `tool_calls` fragments by index. Input that is not a JSON object becomes `{"_raw": text}`
  (`domain.agent.parse_tool_call`), empty input `{}`. Adding tool use to a provider: map
  `AgentMessage`s to its message shape (calls on the assistant turn, every result of a turn in the
  next user turn), parse its streamed calls into `ToolCall`s, map its stop reasons to `StepEnd`,
  keep the retry-before-first-item rule, and add a model to its set only after
  `tests/manual/converse_probe.py` (or a Bedrock run) shows a real call. Tests script steps with
  `FakeProvider(steps=[["text", tool_call("name", arg=...)], ...])`; calls land in
  `provider.conversations`.
- **Retrieval** (ADR 0014): `S3VectorsRetriever` over Amazon S3 Vectors, fed by `TitanEmbedder`,
  built in `lifespan` only when `RETRIEVAL_ENABLED` and injected by `get_retriever` (the planner
  and the card details answer 503 without it). Another store
  is another `Retriever` in `infrastructure/` added to `providers.build_retriever`; never
  `core_api`'s database. Titan V2 accepts only `inputText`, `dimensions`, `normalize` (no `inputType`).
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
- The planner saves nothing: the browser saves the trip through core_api (`saveDraftAsTrip`,
  ADR 0019). ai_api writes nothing to core_api; it only asks it for the caller's access
  (`AccessGateway`, ADR 0026).
- **The planner (`POST /api/v1/ai/planner`, ADR 0015)** is `application/plan_trip.py`: stateless, driven by the
  request (brief + itinerary snapshot + transcript + message or `select`/`remove` action). Group ids carry their
  meaning (`nb`, `hotels:<district>`, `slot:<day>:<part>`) so a selection is read back without a session. The
  model only extracts the brief, ranks/picks ids among retrieved documents and writes `why`; cards come from
  `cards.py` over the document's metadata, ids not retrieved are dropped, `why` and titles go through
  `strip_prices`. It needs the retriever (503 without `RETRIEVAL_ENABLED`); a failed structured call degrades
  (top candidates, plain day titles) rather than failing the turn. Prompts and the fixed
  en/es sentences live in `prompts.py`. **Kiri, one tool-using agent, runs the conversation**
  before the stay and after the draft (ADR 0032).
  **Every message passes the input guard first**: `PlanTrip._guarded` calls
  `InputGuard.check` on a message turn (never `select`/`remove`) before dispatch, in a `chain` span
  `guard` (`details`: `reason`, `allowed`, `usage_units`). A stopped message gets the brief as sent
  and `planner_text(lang, "guard_<reason>")`, reaches no model and leaves the trace `ok`. The
  deployed guard is a Bedrock Guardrail (`infra/aws/guardrail.tf`, `BEDROCK_GUARDRAIL_ID` /
  `_VERSION`); empty, it is `NullInputGuard`. **It fails open**: an adapter error logs and allows,
  since the daily quota and the structural rules below still hold and a guard outage must not take
  the planner down. Behind it, tool results carry guide prose only as `{"untrusted_text": ...}`,
  which the prompts' data rule names (`_AGENT_DATA_RULE`). Routing, in `_on_message`:
  - *Before the stay* (`_before_stay`): `_extract_brief` + `_ahead` run on every message and the
    `brief` event goes out first (the checklist UI); the not-covered sentence stays deterministic;
    while `brief.missing()`, `_ask_missing` asks one question. Complete: the page's own button text
    ("Generate the trip" / "Genera el viaje", `GENERATE_ASKS`, exact match) runs
    `_auto_stay_and_draft`; while the transcript holds no neighbourhoods sentence
    (`agent/context.neighbourhoods_offered`), `_neighbourhood_options` runs with no model step;
    after that, the agent answers with `PRE_STAY_TOOLS` (`search_places`, `get_place`,
    `list_districts`, `offer_neighbourhoods`, `offer_hotels(district?, cheaper)`, `plan_for_me`) and
    `AGENT_PRE_STAY_PROMPT`. `offer_hotels` without a district re-offers the district of the latest
    hotels sentence in the transcript (`last_hotels_district`, either language, anywhere in an
    assistant message: context, not a route); `plan_for_me` is `_auto_stay_and_draft` for "decide tú",
    "surprise me" and any other wording.
  - *After the stay*: the brief is not extracted again (dates do not change after the draft); the
    page's "Alternatives for day N · part" keeps its fast path (`_alternatives_slot` →
    `_find_options`); every other message goes to the agent with `TOOLS` and `AGENT_SYSTEM_PROMPT`.
  - Selections (`select`) and removals (`remove`) never reach the agent. A provider without
    `supports_tools` answers `PLANNER_TEXTS["agent_unavailable"]` (production and the local default
    call tools; it guards a misconfiguration). There is no switch: rolling back is redeploying the
    previous image.

  `agent/context.py` fetches the
  itinerary's documents once (`agent_itinerary`) and writes `AGENT_SYSTEM_PROMPT` with the trip by
  title (before the stay: the brief and the last hotels' district, no fetch); `agent/loop.py`
  (`run_agent`) streams each step's text through `ProseFilter` (cut at
  sentence ends, never next to an amount, each piece through `strip_prices`) and runs the calls in
  order within `AGENT_MAX_STEPS` / `AGENT_MAX_TOOL_CALLS` (past them: `budget_exhausted` results, one
  last step, else `agent_budget`); a `ProviderUnavailable` before the turn sent any event becomes
  the `agent_retry` sentence (the step's span keeps its error), after that it is the stream's `error`
  event. A tool's events reach the page as they come (`Toolbox.stream`; the carousel and draft
  helpers are `run_stream` tools), so a draft from `plan_for_me` streams day by day.
  `agent/tools.py` holds the tools over the `PlanTrip`
  helpers: `search_places`, `get_place`, `list_districts`, `get_weather`, `check_day` (read);
  `add_activity`, `remove_activity`, `move_activity` (remove then put in one patch, the card hydrated
  again), `set_day_title`, `redraft_day` (`_draft_day`, the draft's own per-day step) (write);
  `offer_options` (always a fresh `found:` group, unplaced) and `offer_stays` (forwards
  `_hotel_options` / `_neighbourhood_options`; the agent never sets a stay, except `plan_for_me`
  before it, when the traveller delegates the choice). **Write tools accept
  only ids in `AgentContext.known`** (the itinerary's documents and whatever a tool retrieved or
  fetched this turn) and only places that are not a stay; any other id is an error result the model
  reads (`unknown id: call search_places first`, counted by `note_picks`). A tool's phase is
  announced as it runs; after the loop, every day a write tool touched (except one `redraft_day`
  already checked) gets one patch of its `warn` ops. Known limitation: no op clears a day-level
  warning, so a warning an edit made untrue stays on the page (accepted, ADR 0032). Tests script the
  model with `FakeProvider(steps=...)` (`tests/test_agent_loop.py`, `tests/test_agent_tools.py`).
  **A place the ask names is offered first**:
  `_named_places` runs one unfiltered search on the traveller's words and pins the listings whose
  title the ask names (`_named_at`) ahead of the candidates and of the model's picks, in a guided
  alternatives ask and in `search_places`; `search_places(kind="restaurant")` searches `eat` *and*
  `drink`. Weather: Open-Meteo within 16 days, else the corpus's
  `om:climate:<city>:<MM>` normal fetched by id. **Every card is pictured, and never by another place**
  (ADR 0021): candidates are ordered pictured-first; a card without a corpus
  image is looked up on Commons by name (the search carries the city's name) and at its coordinates,
  where a file still counts only when its title names the venue — the whole name in one phrase, both
  distinctive words, or the single one beside a word for a place to sleep (`choose_named`, the block
  the corpus tool holds word for word) — and, when it was found by name rather than by
  `geosearch`, only when Commons places it within 500 m of the venue (`PhotoFinder`,
  `PHOTOS_ENABLED`); failing that, a card with a `deep_link` shows the preview its own
  site publishes, credited with the bare domain (`SitePreviewFinder`, `SITE_PREVIEWS_ENABLED`); failing
  that, only a neighbourhood borrows — a pictured sight of its district, credited as that sight's
  (`PlanTrip._corpus_photo`); anything else gets the neutral placeholder credited `Illustrative photo`
  (`application/photos.py`). **A stay is always a pictured document** (ADR 0022): the corpus
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
- Upstream bodies and unexpected exceptions never reach the client: `sse.sse_events` sends the
  domain message or a generic one as an `error` event and logs the rest.
- **The planner's stream is typed (SSE v2, ADR 0015):** `schemas/planner_events.py` is a discriminated
  union on `type` (`text`, `brief`, `options`, `itinerary_patch`, `error`, `done`, `progress`), ops on `op`, flat fields,
  **no field optional on the wire** (unknown → `null`; no defaults on the models, so the generated TypeScript
  has no `?`). Build events with the constructors at the bottom of that module (`text()`, `patch()`, ...),
  frame them with `sse.sse_events`. A streamed body has no response model, so `openapi.py` wraps
  `app.openapi()` and adds `PlannerEvent`, `ItineraryOp`, `PlannerTurn` and their models to
  `components.schemas`: any new event or op only needs to join the union, then `just contracts`.
- **The planner tells its progress (ADR 0025).** A phase is set with `turn.phase(name)`
  (never `tracer.phase` directly once the `Turn` exists; `__call__` marks `open` itself, before it
  reads the request): it marks the trace and, unless
  `announce=False`, tells `PackingProgress` (`application/progress.py`), whose `progress` event
  `PlanTrip._with_progress` puts on the stream at once — the turn runs as a task feeding a queue,
  so the event reaches the page while the step's model call is still running. Steps only move
  forward (`open, list, wardrobe, fold, weigh, zip`; `list` is sent just before the `brief`), the
  sentences are `progress_*` in `prompts.py`, and `sources` grow with the cards and the forecast
  that go out. A new phase call site is a `turn.phase(...)`; a step the page should not see twice
  (the draft's per-day fold/weigh) passes `announce=False`.
- **A trip's dates are always ahead.** `_extract_brief` returns `_ahead(brief, today)`:
  dates on or before today ("1 to 3 September" asked in late September) move forward a year at a
  time, both ends together. core_api creates a trip whose dates have passed already locked
  (ADR 0019) and refuses its days, so a planned trip must start tomorrow at the earliest.
- A provider fills the `Usage` it is handed (model and token counts) by the end of the stream, on
  top of logging it. That is what the turn's trace keeps.
- Retries happen only before any delta has been streamed; after that, fail in-band.

## Commands

```bash
uv run uvicorn ai_api.main:app --reload --port 8001
uv run pytest        # no network, no key: fakes for providers, embedder, retriever and boto3 clients
just index budapest [--dry-run]   # fills the S3 Vectors index; needs just aws-login
just planner-smoke budapest es     # real model + KeywordRetriever over the corpus, photo tally; NVIDIA_API_KEY, no AWS
just eval-retrieval [city]         # recall@k / MRR of the deployed index over ai_api/data/eval_questions; needs just aws-login
just eval-answers [city] [flags]   # groundedness / relevance of the chat answers, judged by Nova Pro; ~1 USD; needs AWS
just eval-conversations [city] [flags]  # scripted conversations vs the real planner (--tag, --scenario, --repeat 3, --judge); exit 1 on a safety failure
uv run python tests/manual/guard_probe.py  # false positives of the real guardrail; needs AWS and the guardrail applied
```

Run the smoke session (README "Smoke session") after any change to the planner's prompts, cards or
photos, and paste its summary in the PR: the unit tests script the model, only this exercises it.
A PR that changes the planner's behaviour (prompts, intents, tools, `ClientState`'s mirror of the page)
pastes the table of `just eval-conversations --repeat 3` next to the baseline in
`docs/architecture/agent-evaluation.md`: safety checks may not fail, and the scenarios passed may
drop at most one below the reference. A scenario states what a good planner does, not what the
current one does; when the page's reducer changes, `ClientState` changes with it.
Likewise `just eval-retrieval` after a change to the retriever, its filters, the embeddings or a
city's index: paste its table in the PR, next to the baseline of `docs/architecture/rag-evaluation.md`.

Env: `.env.example` (`LLM_PROVIDER`, `NVIDIA_API_KEY` or `BEDROCK_*` (`BEDROCK_GUARDRAIL_*` too), `CORE_API_URL`,
`RETRIEVAL_*` / `VECTOR_*` / `EMBEDDINGS_*`, and the same
`AUTH_MODE`/`SECRET_KEY`/`COGNITO_*` as core_api). Every setting must be documented there
(`tests/test_env_example.py`).
