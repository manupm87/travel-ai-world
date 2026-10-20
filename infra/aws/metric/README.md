# Local trip business metrics (TRA-281, TRA-282)

For the native AWS service dashboard used in the presentation, see the
[CloudWatch service runbook](../../../docs/runbooks/service-dashboard-cloudwatch.md).
It uses the existing Lambda and API Gateway metrics, independently of Grafana.

The [infrastructure dashboard](../../../docs/runbooks/infrastructure-dashboard-cloudwatch.md)
adds DynamoDB, CloudFront and per-service Lambda error percentages using native
CloudWatch metrics, with no additional metric subscriptions.

`trips_created_total{city_slug="budapest"}` counts a new trip only after
`TripService.create` successfully persists it. Updates, child changes and deletes
do not increment it. Other destinations share `city_slug="other"`; change
`METRICS_CITY_SLUGS` (JSON list, at most 100 entries) before starting the app to
allow more cities. There are no account, session or trip labels.

For Compose, edit `services.core_api.environment.METRICS_CITY_SLUGS` in
`docker-compose.metrics.yml`: the overlay value overrides `.env`. For a direct
uvicorn run, change the value in core_api's `.env` instead.

This folder configures local Prometheus and Grafana, without paid cloud
resources or an AWS deployment. See [ADR 0030](../../../docs/architecture/adr/0030-local-business-metrics.md).

## Start and verify

The stack below is local. For production, use existing CloudWatch application
logs and the separate importable dashboard at
`grafana/cloudwatch/business.json`, described in the
[production runbook](../../../docs/runbooks/business-statistics-cloudwatch.md).
It is intentionally outside `grafana/dashboards`, so local Grafana never
automatically provisions it. Production uses Logs Insights and manual refresh,
not a Prometheus scrape or the local dashboard's counters.

Use Docker Compose 2.24.4 or newer (`!override` support). From the repository
root, prepare the service `.env` files as described in the backend README and
set the same non-empty local `SECRET_KEY` in both. Then run:

```bash
docker compose -f src/backend/docker-compose.yml -f infra/aws/metric/docker-compose.metrics.yml --profile metrics up -d --build dynamodb core_api prometheus grafana
curl http://localhost:8000/metrics
```

Prometheus opens at <http://localhost:9090>; its Targets page must show `core_api`
UP. Open [the business dashboard](http://localhost:13000/d/kyrian-business) in
Grafana; provisioning creates the datasource and dashboard automatically.
The API, Prometheus and Grafana ports bind to loopback. These four services are
started, with one core worker. Create a trip through the authenticated API or
your local frontend and scrape again: the matching series increases by one.
The initial scrape contains zero for every configured city and `other`.

Use the same files/profile for `logs`, `config`, and `down`. The named volume
keeps Prometheus samples across restarts; `grafana_data` preserves Grafana state.
`down -v` deletes both volumes, including collected observations. Prometheus
storage is bounded to 30 days or 512 MB, whichever limit is reached first.

## Grafana dashboard

Grafana 13.2.4 runs on <http://localhost:13000> with anonymous **Viewer** access:
no login, signup or dashboard editing is needed. Use only on a trusted local
machine and never publish this port. Basic authentication and the login form
are disabled, and no plugins, cloud accounts or telemetry are configured.

`grafana/provisioning/datasources/prometheus.yml` points to the server-side
Docker URL `http://prometheus:9090`, not the browser address. If a local override
maps Prometheus to host port 19090, open <http://localhost:19090> in the browser;
the Grafana datasource still uses internal port 9090.

The dashboard `kyrian-business`, in folder **Kyrian World**, refreshes every
15 seconds. Cards and category bars show a snapshot at the end of the selected
time range. With a relative range ending now, this reflects the current core
process since its last restart; an absolute historical range shows historical
values. The historical chart
shows approximate creations per rate interval within the visible range.
Missing average duration reads **Sin datos** instead of a fictitious zero.

The read-only provisioned JSON lives at `grafana/dashboards/business.json`.
Change and commit that file to update the dashboard; Grafana reloads it from
disk. Provisioning overwrites the dashboard from this file and forbids UI saves.
Provisioning details follow the [official Grafana documentation](https://grafana.com/docs/grafana/latest/administration/provisioning/).

Without Docker, set `METRICS_ENABLED=true` in core_api's `.env`. From the repository
root run:

```bash
cd src/backend/services/core_api
uv run uvicorn core_api.main:app --host 127.0.0.1 --port 8000 --workers 1
```

Set Prometheus's target to your host instead of `core_api:8000` if running it
outside the Compose network.

## Trip profile at creation

The recorder receives the persisted trip. These additional metrics capture its
attributes once, at creation; later edits and deletes never change them:

| Metric | Labels or observations |
|---|---|
| `trip_budget_tier_total` | `budget_tier`: `1`, `2`, `3`, `unspecified` for null; unexpected values fall back to `other` |
| `trip_pace_preference_total` | `pace_preference`: `relaxed`, `balanced`, `intense`, `other`, `unspecified` |
| `trip_duration_days` | Histogram of explicitly supplied `duration_days`, including zero; null is omitted |

Pace strings are trimmed and lowercased. Null, empty and whitespace-only strings
count as `unspecified`; any other unrecognized value counts as `other`.
Categorical series start at zero. Profile metrics have no city labels or user
identifiers. Duration is never inferred from dates. Its buckets are
`0, 1, 2, 3, 5, 7, 10, 14, 21, 30, 60, 90, +Inf` days.

## Queries and interpretation

```promql
# Current process counts, by city
sum by (city_slug) (trips_created_total)
# Approximate new trips during the last day, accounting for observed resets
sum by (city_slug) (increase(trips_created_total[24h]))
# Destination ranking during the last day
topk(5, sum by (city_slug) (increase(trips_created_total[24h])))
# Scrape availability
up{job="core_api"}
# Budget snapshots in the last day
sum by (budget_tier) (increase(trip_budget_tier_total[24h]))
# Pace snapshots in the last day
sum by (pace_preference) (increase(trip_pace_preference_total[24h]))
# Average explicitly known duration in the last day (days)
sum(increase(trip_duration_days_sum[24h]))
  / sum(increase(trip_duration_days_count[24h]))
```

The average includes explicit zero-day values and excludes absent durations.
With no known durations in the window, the denominator is zero and the average
is undefined (`NaN`); it is not an average across all created trips.

Counters reset on app restart/reload and start from zero, without backfilling
existing DynamoDB trips. Prometheus `increase` is extrapolated and may be
fractional; writes before the first scrape or during scrape gaps may be missed.
These are approximate local observations, not durable business totals or the
current number of stored trips. A repeated POST that creates a second trip
counts a second creation. Counting and persistence are not transactional; a
crash between them can lose an observation, while a recorder failure is logged
without failing the committed API request.

Metrics default off and stay off on Lambda even if the flag is true. The
unauthenticated `/metrics` route is hidden from OpenAPI and must stay on a
trusted local machine. Never publish this endpoint or overlay. Multiprocess
registries and `WEB_CONCURRENCY` other than 1 are rejected; explicitly launching
uvicorn with `--workers >1` is unsupported too (the app cannot inspect that CLI
flag). Use one worker; no background exporter runs.
