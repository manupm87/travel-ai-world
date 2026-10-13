"""Local single-process Prometheus adapter; no deployed/global registry."""

import os

from fastapi import FastAPI, Response

from core_api.config import CoreSettings


class BusinessMetrics:
    def __init__(self, cities: list[str]) -> None:
        # Import only on the local enabled path: prometheus_client also creates
        # default collectors at import time, which deployed apps do not need.
        from prometheus_client import CollectorRegistry, Counter

        self.registry = CollectorRegistry()
        self.cities = frozenset(cities)
        self.trips_created = Counter(
            "trips_created_total",
            "New trips successfully persisted by this local core_api process.",
            ["city_slug"],
            registry=self.registry,
        )
        for city in self.cities | {"other"}:
            self.trips_created.labels(city_slug=city)

    def record_trip_created(self, city_slug: str) -> None:
        city = city_slug if city_slug in self.cities else "other"
        self.trips_created.labels(city_slug=city).inc()


def configure_metrics(app: FastAPI, settings: CoreSettings) -> None:
    app.state.record_trip_created = None
    if not settings.METRICS_ENABLED or settings.on_lambda:
        return
    from prometheus_client import CONTENT_TYPE_LATEST, generate_latest

    if (
        os.environ.get("PROMETHEUS_MULTIPROC_DIR")
        or int(os.environ.get("WEB_CONCURRENCY", "1")) != 1
    ):
        raise ValueError(
            "Local metrics require one worker and no multiprocess registry"
        )

    metrics = BusinessMetrics(settings.METRICS_CITY_SLUGS)
    app.state.business_metrics = metrics
    app.state.record_trip_created = metrics.record_trip_created

    @app.get("/metrics", include_in_schema=False)
    async def scrape() -> Response:
        # Local machine endpoint: ADR 0030 explicitly exempts user authentication.
        return Response(
            generate_latest(metrics.registry),
            headers={"Content-Type": CONTENT_TYPE_LATEST},
        )
