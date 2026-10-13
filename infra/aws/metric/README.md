# Local trip business metric (TRA-281)

`trips_created_total{city_slug="budapest"}` counts a new trip only after
`TripService.create` successfully persists it. Updates, child changes and deletes
do not increment it. Other destinations share `city_slug="other"`; change
`METRICS_CITY_SLUGS` (JSON list, at most 100 entries) before starting the app to
allow more cities. There are no account, session or trip labels.

For Compose, edit `services.core_api.environment.METRICS_CITY_SLUGS` in
`docker-compose.metrics.yml`: the overlay value overrides `.env`. For a direct
uvicorn run, change the value in core_api's `.env` instead.

This folder configures local Prometheus, not an AWS deployment. No paid cloud
resources or Grafana are created. See [ADR 0030](../../../docs/architecture/adr/0030-local-business-metrics.md).

## Start and verify

Use Docker Compose 2.24.4 or newer (`!override` support). From the repository
root, prepare the service `.env` files as described in the backend README and
set the same non-empty local `SECRET_KEY` in both. Then run:

```bash
docker compose -f src/backend/docker-compose.yml -f infra/aws/metric/docker-compose.metrics.yml --profile metrics up -d --build dynamodb core_api prometheus
curl http://localhost:8000/metrics
```

Prometheus opens at <http://localhost:9090>; its Targets page must show `core_api`
UP. The API and Prometheus ports bind to loopback. Only these three services are
started, with one core worker. Create a trip through the authenticated API or
your local frontend and scrape again: the matching series increases by one.
The initial scrape contains zero for every configured city and `other`.

Use the same files/profile for `logs`, `config`, and `down`. The named volume
keeps Prometheus samples across restarts; `down -v` deletes them. Storage is
bounded to 30 days or 512 MB, whichever limit is reached first.

Without Docker, set `METRICS_ENABLED=true` in core_api's `.env`. From the repository
root run:

```bash
cd src/backend/services/core_api
uv run uvicorn core_api.main:app --host 127.0.0.1 --port 8000 --workers 1
```

Set Prometheus's target to your host instead of `core_api:8000` if running it
outside the Compose network.

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
```

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
