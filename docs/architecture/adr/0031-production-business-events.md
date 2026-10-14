# ADR 0031: Production business statistics from existing application logs

**Status:** Accepted
**Date:** 2026-10-14

## Context

TRA-285 needs production trip creation statistics while keeping the low-budget
Lambda architecture. Local Prometheus counters reset and are unavailable on
Lambda (ADR 0030). A production time series needs observations across execution
environments, without adding servers, custom metrics or background work.

## Decision

After a successful trip add, core_api emits a versioned compact JSON event through
its existing INFO application logger, prefixed `business_event=`. The existing
Lambda log group receives it; there is no extra network call, exporter, stream,
scheduler, metric filter, EMF or database scan/backfill. `BUSINESS_EVENTS_ENABLED`
defaults false in the service and is controlled by a Terraform boolean default
true for core Lambda. Prometheus stays local-only. The composition root combines
the optional observers and isolates their failures individually.

Events carry version 1, `trip_created`, a stable SHA256 of the persisted trip's
UUID bytes, bounded city/budget/pace categories, explicit nullable duration and
the saved creation timestamp. They exclude raw trip/user UUIDs, emails, titles,
descriptions, session references and itineraries. The stable hash is a
pseudonymous deduplication key, not a claim of anonymization. The scoped event
logger remains INFO even when the application's global level is WARNING.

A separate importable Grafana CloudWatch dashboard queries the existing core
group through Logs Insights QL, with manual refresh and a one-hour default
window. Two `stats` stages first deduplicate by event ID, then aggregate saved
categories/duration or time buckets. No fictitious zeros replace missing data.
The local provisioned Prometheus dashboard remains unchanged.

An optional Terraform reader role defaults absent. Operators supply Grafana's
exact principal account and unique external ID in private inputs; trust requires
`sts:ExternalId`. StartQuery, GetLogGroupFields and GetQueryResults are scoped to
the core group. DescribeLogGroups and StopQuery need resource `*`, constrained
to the configured region. This exposes regional group metadata and allows
stopping other queries there, without granting reads of other log groups.
No CloudWatch metrics API, log-write or IAM-management permission is granted.
The deploy workflow forwards private environment variable configuration; clearing
it can plan reader-role deletion and must be reviewed before apply.

## Consequences

Logs Insights scans are billed, including non-business lines in the same group.
Grafana Cloud Free does not make AWS ingestion/storage/query costs free. Start
with narrow windows and manual queries, inspect scanned bytes and actual billing,
and keep the existing retention policy. The reader can query **all messages in
the core group**, including other application logs that may contain personal
information; this is not field-level business-only authorization.

Only new events from activation appear. Deduplication applies within the selected
window and retained logs. Deletion of a trip leaves its creation event, updates
do not alter the snapshot, and a crash or logging failure after persistence can
lose an observation. These are observed creation statistics, not a durable
transactional ledger or current inventory. Rollback disables events and revokes
the optional reader without deleting existing logs. Live trust inputs, apply,
deployment and Grafana account configuration require separate operator review.
