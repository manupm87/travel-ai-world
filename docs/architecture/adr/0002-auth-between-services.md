# 0002 — Stateless JWT in `ai_api`; forward the user's token to `core_api`

**Status:** Superseded by [0009](0009-lambda-cognito-budget.md) (Cognito RS256 tokens replace the shared `SECRET_KEY`; the token is still forwarded `ai_api → core_api`)
**Date:** 2026-09-07

## Context

`ai_api` has no database, but every chat request must be authenticated, and future features
(saving a generated itinerary) need `ai_api` to write data owned by `core_api`. Options were:
(a) `ai_api` calls `core_api` on every request to validate the user; (b) a shared database;
(c) the JWT carries enough to identify the caller and `ai_api` trusts the signature;
(d) a service-to-service secret for writes.

## Decision

- `core_api` issues JWTs that carry the whole `Principal`: `sub`, `email`, `role`, `exp`.
  `SECRET_KEY` is shared by both services (documented in both `.env.example` files).
- `ai_api` authenticates **statelessly** with `travel_common.security.principal_from_token`.
- `core_api` keeps checking the database on every request (`get_active`), so revocation is
  immediate there.
- When `ai_api` must read or write `core_api` data, it **forwards the caller's own bearer token**
  (`infrastructure/core_api_client.py`). `core_api` applies exactly the permissions it applies to
  the browser. No service secret exists.
- A service secret (`INTERNAL_API_KEY`, `/internal/*` router) will be introduced only for jobs
  that run without a user (RAG ingestion).

## Consequences

- No per-request cross-service call for chat; no shared database.
- A deactivated user can keep using `ai_api` for up to `ACCESS_TOKEN_EXPIRE_MINUTES` (60).
  Acceptable today; shorten the expiry or add a revocation list if it stops being acceptable.
- Tokens issued before this change lack `email`/`role` and are rejected; users simply sign in again.
