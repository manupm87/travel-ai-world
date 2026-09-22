# 0023 — DynamoDB is the data store: one table for `core_api`, one interaction log for `ai_api`, RDS retired

**Status:** Accepted
**Date:** 2026-09-22

## Context

ADR 0009 put `core_api` on RDS PostgreSQL (`db.t4g.micro`, 20 GB) and gave it a second
database with `pgvector` for `ai_api`. Two things have changed since.

- **The free tier is over.** RDS costs ~15 €/month, half of the 30 €/month budget, and it is
  the largest item on the bill. It is also the only reason `core_api` runs inside a VPC: private
  subnets, two security groups, a DB subnet group, and a `migrate` command that the deploy
  workflow invokes through the Lambda because the function has no container entrypoint.
- **Postgres now serves `core_api` alone.** ADR 0014 moved the vectors to S3 Vectors, so the
  `ai` database was never used.

What `core_api` asks of its database, read from the code (2026-09-22):

- Four repositories (`user`, `trip`, `chat_thread`, `chat_message`) over a generic
  `BaseRepository`: get by id, list by `user_id` with offset paging, create, update, delete.
- No `join`, `group_by`, `ilike` or report query anywhere. The only SQL function used is `now()`.
- The `Trip` is an aggregate loaded and returned whole (ADR 0005, ADR 0019): its days,
  activities, meals, accommodations and transportations always travel with it.
- Chat messages are read by thread in creation order; the thread's `updated_at` orders a
  user's conversations (ADR 0013).
- The admin endpoints list users and change a role.

Every access has a key: the caller, and then a trip, a thread or a message. A key-value store
covers that and costs almost nothing at this traffic.

We also want to see how the assistant behaves in production: what people ask, what the model
answered, which corpus documents grounded the answer, what it cost in tokens, how long it took
and what failed. Chat messages keep the model, tokens and latency of an answer, but the planner,
the card detail and the structured calls leave no trace, and there is no place to look at any
of it.

## Decision

**DynamoDB is the only database.** Each service owns its own table (rule 2 of `AGENTS.md`):
`core_api` never reads the interaction log, and `ai_api` never reads the core table. Both
tables are on-demand (`PAY_PER_REQUEST`). Both services use plain boto3 through
`asyncio.to_thread` via `travel_common/dynamodb.py`, which both of them need, so it belongs in
the shared kernel. Locally and in CI both run against DynamoDB Local.

### `core_api`: one table, `<prefix>-core`

Point-in-time recovery on, deletion protection on. `PK`/`SK` strings, one GSI
(`GSI1PK`/`GSI1SK`, projection ALL).

| Item | `PK` | `SK` | Notes |
|---|---|---|---|
| Account | `USER#<user_id>` | `PROFILE` | `user_id` is a UUID string (it was an integer); `GSI1PK=USERS`, `GSI1SK=<email>` for the admin list |
| Uniqueness / lookup | `EMAIL#<email>`, `GOOGLE#<google_id>`, `SUB#<cognito_sub>` | `EMAIL`, `GOOGLE`, `SUB` | Point at `user_id`; written in the same `TransactWriteItems` as the profile, guarded by `attribute_not_exists(PK)` |
| Trip | `USER#<user_id>` | `TRIP#<trip_id>` | The whole aggregate in one item; children keep their UUIDs; over 350 KB is `UnprocessableEntity` |
| Conversation | `USER#<user_id>` | `THREAD#<thread_id>` | Without its messages |
| Message | `THREAD#<thread_id>` | `MSG#<created_at µs ISO>#<message_id>` | The sort key is the order; `created_at` strictly increases within a thread |

The rules that come with it:

1. **A user's trips and threads come from one `Query`** (`begins_with(SK, …)`). The service
   sorts them (trips by `created_at`, threads by `updated_at` descending) and applies
   `skip`/`limit`. A user has tens of these items, not thousands.
2. **Another user's trip or thread is `404`, not `403`.** The key includes the caller, so the
   item is simply not there. The API contract changes to match.
3. **Optimistic concurrency.** Profile, trip and thread carry a `version`, and every write is
   conditional on it. A lost race is `Conflict`.
4. **No database cascades.** Deleting a thread deletes its messages first. Deleting a user
   deletes every thread's messages, every item under `USER#<id>`, and the lookup items.
5. **Domain models are plain Python** (`core_api/domain/`). The invariants live there
   (`ensure_editable`, the derived phase of ADR 0019, a message's `check_invariants`).
   Repositories are protocols; storage is an adapter behind them.
6. **The data moves once.** An ops command, `copy-from-postgres`, copies RDS into the table
   through a free DynamoDB gateway endpoint. Users get new UUIDs, and a mapping from the old
   integer ids is applied to their trips and threads. Production switches with a variable
   (`core_storage_backend`) and keeps RDS for one week as a fallback. After that, `core_api`
   leaves the VPC and RDS is destroyed, leaving a final snapshot that is kept for 30 days.

### `ai_api`: the interaction log, `<prefix>-interactions`

TTL on `expires_at`, no point-in-time recovery.

- `PK = DAY#<YYYY-MM-DD>` (UTC), `SK = <ts µs ISO>#<interaction_id>`.
- GSI1 `GSI1PK = SUBJECT#<principal.subject>`, `GSI1SK = <ts>`: one user's interactions.
- **One item per model interaction** (a chat answer, a planner turn, a card detail, a structured
  call): kind, route, subject, thread, city, language, model, `prompt_version` (a hash of the
  template), input/output/embedding tokens, latency and time to first token, status
  (`ok`/`error`/`cancelled`) and error code, the sources used (`doc_id`, score), the planner's
  event counts, and the question and answer truncated to 8 KB each.
- **Privacy.** `subject` is the Cognito `sub`. The email is never written. Items expire after
  90 days (`INTERACTION_TTL_DAYS`). This is operational data, not the user's history: the
  user's history stays in `core_api`'s conversations (ADR 0013).
- **Logging never breaks an answer.** The item is written after the response ends; a failure
  is logged and swallowed, the same rule as `RecordConversation`.
- **Analysis happens in `ai_api`, for admins only** (`Principal.is_admin`, Cognito group
  `admin`). There are three read-only endpoints under `/api/v1/ai/admin`: list a day, open one
  item, and stats over at most 31 day partitions, aggregated in Python. The frontend shows them
  at `/admin/`.

### Estimated monthly cost (eu-west-1, list prices, demo traffic)

| Item | €/month |
|---|---|
| DynamoDB on-demand, both tables (requests + a few MB of storage; 25 GB storage free) | < 1 |
| PITR on the core table (per GB stored) | < 0.1 |
| RDS | 0, removed (was ~15) |
| Everything else, as in ADR 0009 | ~4 |
| **Total** | **~5** |

## Consequences

- **Good.** The largest cost goes away. `core_api` needs no VPC, no subnets, no security groups
  and no migrations, and Lambda has no database connections to exhaust. Local development runs
  one small container instead of PostgreSQL. The interaction log gives us, for the first time,
  a view of the planner and the card detail in production.
- **Bad.** Data integrity moves into application code: uniqueness through lookup items,
  cascades by hand, schema evolution in the adapter (old items must stay readable, or be
  rewritten by a one-off command). Ad hoc questions ("how many trips to Bologna?") need code or
  an export. The user id changes type in the API. Another user's resources answer `404`
  instead of `403`. Most of `core_api`'s persistence layer is rewritten, and so are the tests
  that ran on PostgreSQL.
- **Revisit when.** Aggregating in `ai_api` over a 31-day range stops being fast enough: then
  export the log to S3 and query it with Athena. A feature needs to query trips across users
  (search, public trips, recommendations): then add a GSI for that access, or a read model
  outside DynamoDB. A trip approaches 350 KB: then split the days into their own items under
  the trip's key.
- **Supersedes** the data part of ADR 0009 (RDS, the `ai` database with `pgvector`, the
  `migrate` command, `core_api` inside the VPC). The rest of ADR 0009 stands.

Delivery: epics TRA-212 (TRA-214 to TRA-219) and TRA-213 (TRA-220 to TRA-222).
