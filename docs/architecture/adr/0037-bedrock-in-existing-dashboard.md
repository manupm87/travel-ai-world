# 0037 — Bedrock metrics in the existing service dashboard

**Status:** Accepted
**Date:** 2026-10-22

## Context

The presentation needs an operational view of the AI provider without expanding
the small infrastructure budget. The service dashboard already contains Lambda,
API Gateway and Cognito metrics: 24 native references and 29 entries including
math. There are three custom dashboards. The documented CloudWatch free-tier
allowance is up to three dashboards with up to 50 metrics each, subject to the
account's eligibility and shared usage.

Turn traces, tool execution and RAG details already live in DynamoDB and are read
through `/admin`. The observability epic keeps that AI analysis there; the agent
counter work is a separate concern. Copying traces into CloudWatch would add
ingestion and query costs and could expose prompts or user data. Bedrock already
publishes operational metrics without invocation logging.

## Decision

Append six charts to the existing service dashboard using 17 native
`AWS/Bedrock` metric references. Show accepted invocations and token sums per
minute, chat and embedding latency p50/p95 in milliseconds, streaming chat
time-to-first-token p50/p95, and client errors, AWS errors and throttles per
minute for both models.

Bind `ModelId` to `bedrock_chat_model` and `embeddings_model` exactly as configured,
in the configured region. Preserve the EU inference-profile prefix for chat;
do not add historical model series or extra dimensions. Keep three dashboards,
41 native references and 46 entries including math, a three-hour initial window,
one-minute periods and manual refresh. Do not enable invocation logging,
custom metrics, alarms, new resources, backend changes or extra model calls.

## Consequences

This updates only the existing dashboard body. Data includes any workload using
the same ModelId in the account and region, not just `ai_api`. A model-variable
change selects a different series; history is not combined across models.
Accepted invocations include processing failures but exclude throttles and
pre-processing validation rejections. SDK retries can produce multiple model
calls per turn, and errors before model identification can be absent from
model-specific series. Counts do not represent users or successful turns.

Invocation latency is time to the last model token; streaming TTFT is time to
the first model token. Neither is the entire planner duration or time to the
first SSE event. Missing data remains absent. No reliable per-request generation
speed, dedicated timeout count, cost, quality or availability is inferred from
these aggregates. Tool/RAG and agent analysis remain in `/admin`; no trace,
prompt, response or user identifier is exported.

No fourth dashboard or log-ingestion/query charge is introduced. Standard
CloudWatch pricing, account allowance and normal model usage costs still apply;
the total bill is not guaranteed to be zero. The
[service runbook](../../runbooks/service-dashboard-cloudwatch.md) documents the
statistics, scope and verification steps. See
[Bedrock runtime metrics](https://docs.aws.amazon.com/bedrock/latest/userguide/monitoring-runtime-metrics.html).
