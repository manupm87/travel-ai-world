# 0027 — Retire the chat v1: `POST /ai/chat` and `core_api`'s conversations

**Status:** Accepted
**Date:** 2026-10-03

Supersedes [ADR 0013](0013-chat-conversations-in-core-api.md). TRA-275, from findings AI-6,
FEP-10, AI-12, CORE-3 and CORE-7 of the
[code quality review of 2026-09-27](../code-quality-review-2026-09-27.md) (§3, D1, D7 and D8).

## Context

The first chat (`POST /api/v1/ai/chat`) streamed plain text deltas and recorded every exchange in
`core_api` as a conversation: a `THREAD#` item under the owner and `MSG#` items under the thread
(ADR 0013, stored as ADR 0023 describes). The planner (`POST /api/v1/ai/planner`, ADR 0015)
replaced it in the product, and since aa5396a (TRA-192, 2026-09-20) no client calls it: the
frontend's `services/chat.ts` had no caller left, and nothing reads the conversations back.

The route was still deployed: until ADR 0026 any signed-in account could call it, and since then
any invited one can, against Claude Haiku 4.5, with up to 40 replayed turns of 8,000 characters
each. Unused code that spends tokens and writes to the core table is a cost and a risk with no
return: every change to the access check, the traces or the providers had to keep it working, and
its tests ran on every PR.

## Decision

Remove the whole vertical, end to end:

- **`ai_api`**: the route (`api/v1/endpoints/chat.py`), the `StreamChat` and `RecordConversation`
  use cases, the `ConversationGateway` port and its two methods in `CoreApiClient` (which keeps
  only the access question of ADR 0026), the chat's SSE framer (`sse_stream`), `ChatRequest`,
  `CHAT_SYSTEM_PROMPT`, the domain types only it used (`ChatTrace`, `ChatTurn`, `Source`,
  `ThreadSaved`), `RecordTrace.chat`, and the settings only it read: `CHAT_RECORD_CONVERSATIONS`
  and `RETRIEVAL_LIMIT`.
- **`core_api`**: the `/chat-threads` routes, `ChatThreadService`, `ChatMessageService`, their
  schemas, the `ChatThread` and `ChatMessage` entities, the `ChatRole` enum, their repository
  ports and DynamoDB adapters, the `THREAD#`/`MSG#` key helpers, and the step of the user delete
  that removed a user's threads and messages.
- **Frontend**: `src/services/chat.ts` and its tests. The generated types lose the removed
  schemas (`just contracts`).

Kept, because the planner uses them: `ai_api`'s `ChatMessage` (a replayed turn of
`PlannerTurn.history`) and the limits beside it in `schemas/chat.py`, `RAG_CONTEXT_PROMPT` and
`format_context`, the `CHAT_*` sampling settings, and `CORE_API_URL` (the access check). The trace
kind `chat` stays in `Kind`: the traces the retired route wrote are read by the admin console until
they expire (`INTERACTION_TTL_DAYS`, 90 days).

### Also retired in TRA-275

- **`BEDROCK_TITLE_MODEL`** (AI-12). No code read it, yet Terraform passed it to the function and
  granted the role Nova Lite. The setting, the `bedrock_title_model` variable, the Lambda
  variable and its IAM grant go: the role can invoke the chat model's inference profile only.
- **What `PATCH /users/{id}` and `PATCH /users/{id}/role` allow** (CORE-3, CORE-7). The account
  owner's PATCH no longer takes `email` (a sign-in finds its account by email, so the next one
  would start a new account, without the trips) nor `is_active` (switching an account off had no
  way back); it changes `name` and `picture`. The role route is mounted only when
  `AUTH_MODE=local`: with Cognito the pool's `admin` group is the role, and the account's next
  request would undo any stored change.

## Consequences

- **Orphan items stay in the core table.** The `THREAD#` items under `USER#<id>` and the `MSG#`
  items under `THREAD#<id>` written until now are left as they are: no migration, no one-off
  script. Nothing reads or writes them. Deleting a user still removes everything under
  `USER#<id>`, the `THREAD#` items included, but no longer the `MSG#` partitions: those stay
  until someone deletes them by hand.
- Two routers, four use cases and three ports fewer (`ConversationGateway`,
  `ChatThreadRepository`, `ChatMessageRepository`); the access check, the traces and
  `RecordTrace` serve the planner alone, and the planner is the only route that calls the chat
  model.
- **A deploy changes the function.** The backend images lose the route and the Terraform apply
  removes `BEDROCK_TITLE_MODEL` from the `ai-api` function and the Nova Lite grant from its role:
  the PR needs `Deploy backend` with `apply=true`.
- Bringing a chat back means a new decision: a route, its access check and, if it should keep
  conversations, a store for them. ADR 0013 records what the first one did.
