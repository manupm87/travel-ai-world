# AGENTS.md — ai_api

Read [`backend/AGENTS.md`](../../AGENTS.md) first. `ai_api` owns everything that talks to language
models and retrieval. It has **no database** and never imports `core_api`.

## Layout (ports and adapters)

```text
domain/         Message, ChatRole, Document, GenerationParams + Protocols: LLMProvider, Retriever, TripGateway
application/    use cases (StreamChat). Depend only on domain ports.
infrastructure/ adapters: nvidia_provider.py, sse.py, retry.py, core_api_client.py
api/            deps.py (per-request wiring; process resources come from app.state), v1/endpoints/{chat,health}.py
main.py         lifespan builds the provider once (NvidiaProvider.from_settings) and closes it on shutdown
prompts.py      every prompt string (system prompt, RAG context template)
testing.py      FakeProvider + settings_for_tests() for any test suite
```

- Routes live under `/api/v1/ai/*` so a proxy can route by prefix. Keep it that way.
- Auth is **stateless**: `principal_from_token(token, settings)`; no user lookup.
- Adding a provider: implement `LLMProvider` in `infrastructure/`, build it in `main.lifespan` and
  put it on `app.state.llm_provider`. The use case and the endpoint do not change. Sampling comes
  from `AISettings` (`CHAT_*`) as a `GenerationParams`, never from literals in the adapter.
- Adding RAG: implement `Retriever` in `infrastructure/` (own vector store; never `core_api`'s DB),
  inject it in `get_stream_chat`. Persisting results goes through `TripGateway` with the caller's token.
- SSE wire format to the browser is fixed (`data: {"content"}`, `data: {"error", "error_code"}`,
  `data: [DONE]`); the frontend's `services/chat.ts` depends on it. Upstream bodies and unexpected
  exceptions never reach the client: `sse.py` sends the domain message or a generic one and logs the rest.
- Retries happen only before any delta has been streamed; after that, fail in-band.

## Commands

```bash
uv run uvicorn ai_api.main:app --reload --port 8001
uv run pytest        # no network, no key: FakeProvider + httpx.MockTransport
```

Env: `.env.example` (`NVIDIA_API_KEY`, `SECRET_KEY` = core_api's, `CORE_API_URL`).
