# 0034 — Native CloudWatch service dashboard

**Status:** Accepted
**Date:** 2026-10-20

## Context

The project presentation needs an operational view in CloudWatch alongside the
business statistics in Grafana. Production uses Lambda; the local Prometheus
instrumentation of [ADR 0030](0030-local-business-metrics.md) is disabled there.
[ADR 0031](0031-production-business-events.md) covers business events in logs.

## Decision

Version a native `aws_cloudwatch_dashboard` with existing Lambda and REST API
Gateway metrics. Bind dimensions to Terraform resource names. Show Lambda
invocations, execution duration p50/p95, errors, throttles and concurrency, plus
stage-wide HTTP traffic, errors and latency. Default to three hours and one-minute
periods, with no automatic log queries or additional application instrumentation.

## Consequences

The dashboard can show existing production metrics without a service deployment.
It may incur standard dashboard charges. Lambda failures differ from HTTP 5xx;
duration excludes cold starts, and concurrency is not an exact HTTP in-flight
count. It does not prove availability or provide route-level metrics. The
remaining instrumentation and broader widgets in TRA-297 are separate work.
