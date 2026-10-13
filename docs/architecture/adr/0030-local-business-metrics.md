# ADR 0030: Local trip creation business metric

**Status:** Accepted
**Date:** 2026-10-13

## Context

TRA-281 needs trip creation counts by city for a local, low-budget evaluation.
The backend runs on Lambda in production, where per-process counters cannot
represent shared business state (backend AGENTS.md). User-facing routes are
authenticated and gated by the access list (ADR 0026).

## Decision

Only core_api owns `trips_created_total`. Its composition root creates a private
Prometheus registry and recorder per app when `METRICS_ENABLED=true`, default
false. Lambda always refuses activation, without allocating a registry or
mounting a route. The service receives an optional callback and calls it after
a successful repository add; an observer failure is logged without failing a
committed request. Update/delete and child writes do not count.

TRA-282 extends the same callback to receive the persisted `Trip` and record
bounded budget and normalized pace category counters, plus a duration histogram.
Null categories use `unspecified`, unknown pace uses `other`, and only an
explicit duration (including zero) is observed. No duration is inferred from
dates. These are snapshots at creation; updates do not revise them. There are
no city/profile label cross products or new public contracts.

Labels use a configured allowlist of at most 100 city slugs (Budapest by
default), with unknown slugs grouped into `other`. Series start at zero, and
contain no user or trip identifiers. There are no default process collectors,
threads, schedulers or exporters. The shared app factory stays unchanged.

The local `GET /metrics` machine endpoint is an explicit, narrow exception to
core_api's rule that routes use `get_current_user`. It has no bearer/access-list
dependencies, stays outside `/api/v1` and OpenAPI, and is never present on
Lambda. The Compose overlay binds core_api and Prometheus to loopback. This
exception does not extend to business endpoints or any deployed service.

Infrastructure lives under `infra/aws/metric` to match the existing deployment
layout, but is exclusively a local Compose overlay. A metrics-profile Prometheus
scrapes core_api with a read-only config and named data volume bounded to 30
days/512 MB. One core worker is required; multiprocess operation is unsupported.
No Terraform resource, cloud deployment, Grafana or new public contract is added.

## Consequences

This supports local usage and destination comparisons, with bounded cardinality
and storage. Counters reset on restarts and do not backfill the database.
PromQL `increase` handles observed resets but extrapolates and may miss writes
around scrape gaps, first scrapes or crashes. Counts are approximate and are
not transactional or durable business totals. A future production metric needs
a separate design using durable events/storage, rather than activating this
adapter on Lambda.
