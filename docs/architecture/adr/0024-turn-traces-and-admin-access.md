# 0024 — A turn is a trace with steps; admins are the Cognito group, filled from Terraform

**Status:** Accepted
**Date:** 2026-09-23

Amends the `ai_api` section of [ADR 0023](0023-dynamodb-data-store.md) (the interaction log) and
settles how the administrators of the console are managed. Epic TRA-213 (TRA-220 to TRA-222,
TRA-226 to TRA-229).

## Context

We want an admin console to understand, turn by turn, what the AI did: which model calls it made
and what they cost, which corpus documents each retrieval returned (the top-k, with their
distances and the filters that produced them), which of those the model actually used, where a
structured answer had to be repaired, and how the answer streamed to the browser. It will be shown
side by side with the product, so it has to explain a turn to someone who did not write the code.

What the code offers today (audit of 2026-09-23):

- The planner persists nothing. `POST /api/v1/ai/planner` is stateless (ADR 0015): the browser
  keeps the draft in `sessionStorage` and sends it back every turn. Only the chat records its
  turns in `core_api` (ADR 0013), and the product no longer uses that chat.
- There is no observability. The planner passes no `Usage` to its model calls, measures no step,
  has no turn id, and a retrieval leaves one INFO line with the first five ids. Repairs of a
  structured answer are a WARN line. CloudWatch keeps 14 days of that.
- ADR 0023 decided a flat log: **one item per interaction** with tokens, latency, event counts
  and `sources` as `(doc_id, score)`. That answers "how much" and "how fast", not "what happened":
  no steps, no filters, no `k`, no per-call output, no timeline.
- Admins exist only as `Principal.is_admin`, set from the Cognito group `admin`
  (`travel_common.cognito`). The frontend ignores the role; nothing lists another user's trips.

The industry has converged on a shape for this data: a **trace** per request made of typed
**observations** (Langfuse's trace / observation / session; OpenInference's span kinds `LLM`,
`RETRIEVER`, `EMBEDDING`, `TOOL`, `CHAIN`; the OpenTelemetry GenAI attributes
`gen_ai.request.model`, `gen_ai.usage.input_tokens`, `gen_ai.usage.output_tokens`,
`gen_ai.response.time_to_first_chunk`). Retrieval observations carry the query and every
document with its score. Content is opt-in and truncated; users are pseudonymous; retention is a
TTL. We adopt that vocabulary rather than invent one, so the data can later be exported to any
of those tools.

## Decision

### A turn is a trace (`ai_api`, table `<prefix>-interactions`)

One request to `ai_api` — a planner turn, a chat answer, a card detail — is one `TurnTrace`:

| Item | `PK` | `SK` | Holds |
|---|---|---|---|
| Summary | `DAY#<YYYY-MM-DD>` | `<ts µs ISO>#<turn_id>` | kind, route, subject, `session_id`, `trip_id`, city, language, action, model, provider, `prompt_version`, tokens (input, output, embeddings), `cost_usd` + `pricing_version`, latency, time to first event, status, error code, counters (model calls, retrievals, documents retrieved and used, repairs, dropped ids, prices stripped, warnings), event and op counts, `sources` (every retrieved `doc_id` with its distance and a `used` mark, ≤ 200), previews of question and answer |
| Context | `TURN#<turn_id>` | `CONTEXT` | the request (message or action, brief, snapshot ids, history ≤ 8 KB), the answer text ≤ 8 KB, the ops and option groups emitted, and the summary's key |
| Step | `TURN#<turn_id>` | `SPAN#<seq>` | `kind` (`llm`, `retriever`, `tool`, `chain`), name, phase, parent, `t0_ms`, `dur_ms`, level, and the kind's payload |
| Events | `TURN#<turn_id>` | `EVENTS` | the SSE timeline: `t_ms`, type, summary, bytes (text deltas collapsed) |

- **Step payloads.** `llm`: provider, model, operation (`chat` / `structured`), schema name,
  `prompt_version` (first 12 hex of the SHA-256 of the template), sampling params, tokens, time to
  first chunk, attempts, whether it was repaired, the validation error, `picked_ids`,
  `dropped_ids`, input and output truncated to 8 KB on a UTF-8 boundary. `retriever`: purpose,
  query, filters, `k`, the step of the widening ladder, embedding model and tokens, and every
  result with `doc_id`, title, category, district, distance, rank and `used`. `tool`: the external
  service (Open-Meteo, Commons, site previews, flights), host, status, count. `chain`: a code step
  (`read_turn`, `hydrate`, `validate_day` with its warnings at `level=warning`, `strip_prices`).
- **`used` needs no judge.** When a pick returns ids, the tracer marks them on the retrieval
  steps that returned them (`mark_used`). "Used over retrieved" is therefore a fact, not a score.
- **Phases** are the five the design names after packing a suitcase, with English ids on the
  wire: `open` (read the turn, hydrate, extract the brief, classify, set stay and route),
  `wardrobe` (weather, skeleton, the neighbourhood, hotel, named-place and chat searches), `fold`
  (candidates and picks), `weigh` (validate, strip prices, photos), `zip` (the closing text).
- **Keys and indexes.** GSI1 `SUBJECT#<subject>` / `<ts>` (one user's turns), GSI2
  `SESSION#<session_id>` / `<ts>` (one conversation's turns; sparse). Every item carries
  `expires_at` (TTL, `INTERACTION_TTL_DAYS`, default 90). Caps keep every item far from 400 KB:
  8 KB per payload, 200 steps and 500 event marks per turn, `truncated=true` beyond.
- **Written before `[DONE]`.** The tracer lives in a `ContextVar` for the request; the endpoint
  wraps the event stream, and on `done` or `error` the trace is written with `BatchWriteItem`
  before the closing frame is sent (Lambda may freeze the process once the response ends). A
  failure to write is logged and never reaches the client; a client disconnect writes
  `status=cancelled` best effort. `RecordConversation` keeps writing the chat to `core_api`.
- **Cost** is computed at write time from a versioned price table (`application/pricing.py`) and
  stored with its version; models without a public price get `null`, never a guess.
- **Privacy.** The subject only, never the email; payloads truncated; TTL enforced by the table.
  Every admin read logs one audit line (`admin_read subject=… route=… target=…`).

### Session and trip

The frontend mints a `session_id` per planner draft and sends it with every turn
(`PlannerTurn.session_id`, beside `trip_id` once the trip is saved). A saved trip stores
`planner_session_id`. That links a trip to the turns that made it in both directions without
`ai_api` ever reading `core_api`'s table.

### Who is who

`core_api` keeps the token `subject` on the account (`User.subject`, written by the upsert that
runs on every request). The admin console joins subject → account in the browser from the admin
users list. The trace never carries the email (ADR 0023's rule stands).

### Admins are the Cognito group, filled from Terraform

The list of administrators is `admin_usernames` in `infra/aws/terraform.tfvars`; `terraform
apply` puts each one in the user pool group `admin` (`aws_cognito_user_in_group`). The ID token
then carries `cognito:groups`, which `travel_common.cognito` already maps to `Role.ADMIN`, and
`core_api` mirrors it on the profile. The list is code-reviewed, the runtime source of truth is
the token, and no service reads a list at request time. The username of a federated account is
`google_<sub>`, known only after the person's first sign-in (`just cognito-username <email>`
finds it). Locally, `python -m core_api.devtools token <email> --admin` mints an admin token.
Rejected: an `ADMIN_EMAILS` setting (a second source of truth, checked on every request in two
services) and a pre-token-generation Lambda (a function and a deploy path for a list of two).

### Read-only analysis in each owning service; the console in the frontend

`ai_api` serves the traces under `/api/v1/ai/admin` (turns by day, user, session or trip; one
turn with its steps and events; stats over ≤ 31 day partitions, aggregated in Python, with the
RAG metrics: retrievals per turn, no-hit rate, used over retrieved, mean distance of what was
used, repair rate, most used and never used documents). `core_api` serves every trip and account
under `/api/v1/admin` (a sparse GSI2 `TRIPS` / `<created_at>#<trip_id>` with a summary
projection). Neither service reads the other's table.

The frontend's `/admin/` is its own route group with a sidebar: overview, turns, trips, users,
and the **turn inspector** — the design boards "Chat en modo admin" and "Admin en móvil": on the
left what the traveller saw, on the right what they did not (chips, the trace as a waterfall by
phase and step kind, the brief, each model call's output with its validation, the SSE timeline,
and one city-kb panel per retrieval with filters, `k`, the embeddings model and the results
table with the `used` mark and the distance). It is built with today's tokens and a monospace
font for ids; the boards' visual language (Kiri, the new palettes) lands with the redesign.
Charts are hand-drawn SVG; no chart library.

### The delivery workflow pins its models

`.claude/workflows/kyrian-wave.js` names `claude-opus-5-5` for the implementer and the fixer and
`claude-sonnet-5` for the three reviewers, so a wave does not drift with the aliases.

## Consequences

- **Good.** Every turn in production can be replayed step by step, with the retrieval's top-k and
  what the model kept from it. The vocabulary is the industry's, so the traces are an export away
  from Langfuse, Phoenix or CloudWatch GenAI dashboards, and they are the dataset for offline
  evaluations (RAGAS, the TruLens triad) when we want them. The admin list is a reviewed file.
- **Bad.** A draft turn writes some 40 items (two batches) in the tail of the stream, adding
  ~100 ms before `[DONE]`. Range stats read every summary of the range in `ai_api`; past a few
  thousand turns a day, export to S3 and Athena (ADR 0023's revisit clause). Making someone an
  admin needs their first sign-in, one lookup and one apply.
- **Out of scope, on purpose.** LLM-as-judge evaluations and human scores (the traces are their
  input), alerts, Athena, and the `progress` SSE event for the traveller's own UI (it belongs to
  the redesign; the phase already travels on every step).
- **Revisit** when a turn approaches the caps, when stats need more than a month, or when a second
  consumer (evaluations, alerts) wants the traces: then a DynamoDB Stream to S3.
