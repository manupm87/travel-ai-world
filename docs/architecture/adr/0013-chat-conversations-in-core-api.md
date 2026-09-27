# 0013 — Chat conversations are stored by `core_api` and written by `ai_api` over HTTP

**Status:** Accepted (storage superseded by [0023](0023-dynamodb-data-store.md): thread and message items in `core_api`'s table, another user's thread is 404)
**Date:** 2026-09-17

Drafted with the tables and endpoints (TRA-153, first PR); accepted with the recording in `ai_api`
(TRA-153, second PR).

## Context

The chat keeps nothing between requests. The frontend sends the recent history with every message
(`ChatRequest.history`, at most 40 turns) and no turn is stored, so a test of the RAG cannot be
reviewed afterwards and a user cannot come back to a conversation.

Forces:

- `ai_api` runs outside the VPC and RDS is private ([ADR 0009](0009-lambda-cognito-budget.md)):
  it cannot open a database connection. The repository rules also keep SQLAlchemy out of `ai_api`;
  the database belongs to `core_api`, its schema to Alembic, and the deploy runs `migrate`.
- A LangGraph Postgres checkpointer (`checkpoints`, `checkpoint_blobs`, `checkpoint_writes`,
  `checkpoint_migrations`) was considered and rejected: it needs a direct connection from the
  process that runs the graph, it stores serialized graph state instead of a conversation someone
  can read, and `ai_api` uses no agent framework (its use cases call the `LLMProvider` and
  `Retriever` ports directly).

## Decision

1. **Two tables in `core_api`**, one Alembic migration:
   - `chat_threads`: `id` (UUID), `user_id` → `users` (cascade), `title`, `city` (the corpus
     slug: `madrid`, `berlin`, `budapest`), `created_at`, `updated_at`. `updated_at` moves with
     every appended message, so a user's list shows recent conversations first.
   - `chat_messages`: `id`, `thread_id` → `chat_threads` (cascade), `role` (`user` |
     `assistant`), `content`, `sources` (JSONB list of `doc_id`, `score`, `title`, `url`),
     `model`, `input_tokens`, `output_tokens`, `latency_ms`, `created_at`. `created_at` defaults
     to `clock_timestamp()`, not `now()`, so a question and its answer written in one transaction
     keep their order. Index on `(thread_id, created_at)`.
2. **A thread is its own root, owned like a trip** ([ADR 0005](0005-trip-aggregate-nested-resources.md)):
   `/api/v1/chat-threads` (list, most recent first; create; read; patch; delete) and
   `/api/v1/chat-threads/{thread_id}/messages/` (list in order; append). `get_owned_chat_thread`
   authorizes once; another user's thread is 403, as for trips.
3. **Messages are append-only.** There is no edit or delete of a single message; deleting the
   thread or the account deletes them. The `ChatMessage` entity rejects sources, model or usage
   on a user turn. The models declare no relationships: the database cascades the deletes, so
   nothing is lazy-loaded from an async serializer.
4. **`ai_api` writes the turns over HTTP with the caller's token**, through a `ConversationGateway`
   port, the way `TripGateway` reads trips. `ai_api` stays stateless; the conversation lives in
   `core_api`.

## Consequences

- Every conversation, local or deployed, can be reviewed with its sources, model, tokens and
  latency: raw material for evaluating the RAG and for checking the spend.
- Saving a turn adds one or two calls from `ai_api` to `core_api` after the answer has streamed.
  A failure to save must not break the answer (second PR).
- Conversations are personal data kept until the thread or the account is deleted; there is no
  retention policy yet.
- Reading the tables with pgAdmin works against the local database. RDS needs a tunnel (an EC2
  Instance Connect Endpoint and a small instance), left for a separate infrastructure issue.
- Revisit when the planner (TRA-136) keeps its draft as a `planning` trip: a thread could then
  point to that trip.
