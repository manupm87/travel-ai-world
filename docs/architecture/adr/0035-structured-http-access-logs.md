# 0035 — Structured HTTP access logs before response completion

**Status:** Accepted
**Date:** 2026-10-21

## Context

The native dashboards of [ADR 0034](0034-native-service-dashboard.md) show function
and stage aggregates. TRA-297 also needs status and latency by route, plus cold
starts. Production uses Lambda Web Adapter: work after the response may freeze.
The project must keep log volume small and avoid personal data in access events.

## Decision

Add an opt-in pure ASGI observer in the shared app factory. ACCESS_LOG_ENABLED is
false locally by default; Terraform enables it in both production functions.
It writes one bounded JSON object with marker `access_log=`: route template,
standard method, status, duration_ms, nullable validated invocation UUID,
cold_start, outcome and schema version. It does not record URLs, parameters,
headers, bodies, tokens or identities. Unknown routes use a fixed bucket.
When enabled, the container disables Uvicorn's raw URL access lines.

Emit synchronously before sending the terminal ASGI body/trailers, never through
a callback or background task. Duration measures final-message readiness, not
browser delivery or first token. Streaming interruptions preserve the status
already sent and are identified separately. Observer failures do not change the
HTTP behavior. The first genuine Lambda invocation marks a process lifecycle
flag; readiness probes do not consume it. It is not a cross-request aggregate.

Use a third manual-refresh CloudWatch dashboard with exact per-service log
groups: route summaries, request/5xx trends and Lambda REPORT Init Duration.
Runtime Init Duration and the application first-invocation flag are distinct.

## Consequences

New requests become queryable only after image deployment and setting activation;
historical access records are not backfilled. Existing log-group retention stays
at 14 days by default. Each dashboard open/refresh runs six scans over the selected
log-group time window, including unrelated messages in those groups. Queries are
not free merely because they filter on the access marker. No metric filters,
new dependency, collector, alarm or scheduler is added. Existing business events
and other application logs keep their contracts and separate privacy boundaries.
