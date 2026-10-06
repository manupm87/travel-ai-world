# 0029 — Structured planner answers are constrained by the active provider

**Status:** Accepted
**Date:** 2026-10-06

## Context

`ai_api.application.structured.complete_json` used to append a JSON Schema to a system prompt, parse tolerant text, and make a second model call to repair invalid output. The providers did not receive the schema as a request constraint. This added latency and tokens without guaranteeing the returned shape.

The service has two runtime paths: NVIDIA-hosted models for local development and Amazon Bedrock Converse for AWS. Capability is model-specific: direct probes confirmed JSON Schema output for NVIDIA `z-ai/glm-5.3-flash` and Bedrock profile `eu.anthropic.claude-haiku-4-5-20251001-v1:0` in `eu-west-1`. The previous local NVIDIA model `minimaxai/minimax-m3` returns HTTP 410 and has been retired.

## Decision

`LLMProvider.complete` accepts an optional JSON Schema and schema name. `complete_json` sends that schema when the active model is verified to support native constrained output: NVIDIA uses OpenAI-compatible `response_format` only for GLM-5.3-Flash; Bedrock uses Converse `outputConfig.textFormat` only for the verified Claude Haiku 4.5 EU profile. Other configured models keep the prompt instruction and tolerant JSON extraction. The stream path and planner SSE contract remain unchanged.

Pydantic still validates every result. The outbound schema is normalized to the supported provider subset: object properties are required with `additionalProperties: false`, and unsupported constraints/defaults are omitted from generation while remaining enforced by Pydantic after generation. Structured calls make one model attempt. Invalid output raises a domain error; planner use cases apply their existing deterministic fallbacks. The repair instruction and second request are removed. GLM requests use low reasoning effort and clear hidden thinking, including streaming requests.

The tracer records the mechanism and whether a deterministic fallback was used. A new `fallback_rate` appears in admin stats; `repair_rate` remains readable for historical traces. Old DynamoDB summaries without a fallback counter load it as zero. `AISettings` explicitly loads the service `.env`, and the local default, `.env.example`, and planner smoke default use GLM-5.3-Flash.

## Consequences

- Good: supported models constrain structured output at generation time; successful structured calls use one provider request rather than a repair round trip.
- Good: planner behavior on invalid/refused/truncated output stays deterministic and traceable; Pydantic validation remains the semantic check.
- Good: the frontend planner contract and SSE events do not change. Generated frontend types change only for the admin trace fields `fallbacks` and `fallback_rate`.
- Tradeoff: schemas sent to providers omit constraints outside the supported JSON Schema subset. Pydantic enforces those constraints after generation; callers must keep the deterministic fallback for invalid results.
- Tradeoff: GLM is served by NVIDIA remotely, not on the devcontainer GPU. The planner smoke took about 9.8 minutes and had one transient NVIDIA retry; the low-reasoning setting did not materially reduce total session latency. No per-token price comparison was established.
- The Bedrock adapter and planner were exercised locally using SSO against the configured profile. No Lambda deployment or production request was made; deploy only after the PR is reviewed and merged.

## Verification record

- Direct constrained-output probe: GLM-5.3-Flash returned the enum value `ACEPTADO` despite a conflicting prompt; Bedrock Claude Haiku 4.5 returned `ACCEPTED` under the same constraint test.
- Integrated `complete_json` probes passed against both live adapters.
- Full local planner smoke: GLM-5.3-Flash, Budapest corpus, two days, no photo lookups: `RESULT: OK`, 8 activities, 8 distinct IDs, 3 distinct neighbourhood photos, no prices, no unpictured cards; one upstream retry, about 9.8 minutes.
- Full local planner smoke: Bedrock Claude Haiku 4.5 with the same corpus/session: `RESULT: OK`, 8 activities and the same card/photo/price checks; about 33 seconds.
- Bedrock `pick_hotels` span: 1,179 input tokens, 146 output tokens, no fallback.
- Automated gates: `just test-ai` (714 passed), `just lint` (Ruff, formatting, Pyright, ESLint), `just contracts-check`, and `just docs-check` passed.
- Branch/commit: `feat/TRA-261-provider-native-structured-outputs`, `5e60a4f` (implementation commit). The report is a follow-up documentation commit.
