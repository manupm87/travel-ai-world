"""Local single-process Prometheus adapter; no deployed/global registry."""

import os

from fastapi import FastAPI, Response

from core_api.config import CoreSettings
from core_api.domain.models import Trip


class BusinessMetrics:
    def __init__(self, cities: list[str]) -> None:
        # Import only on the local enabled path: prometheus_client also creates
        # default collectors at import time, which deployed apps do not need.
        from prometheus_client import CollectorRegistry, Counter, Histogram

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
        self.trip_budget_tier = Counter(
            "trip_budget_tier_total",
            "Budget category of newly persisted trips, at creation.",
            ["budget_tier"],
            registry=self.registry,
        )
        for budget in ("1", "2", "3", "unspecified", "other"):
            self.trip_budget_tier.labels(budget_tier=budget)
        self.trip_pace_preference = Counter(
            "trip_pace_preference_total",
            "Pace category of newly persisted trips, at creation.",
            ["pace_preference"],
            registry=self.registry,
        )
        for pace in ("relaxed", "balanced", "intense", "other", "unspecified"):
            self.trip_pace_preference.labels(pace_preference=pace)
        self.trip_duration_days = Histogram(
            "trip_duration_days",
            "Explicit duration in days of newly persisted trips, at creation.",
            buckets=(0, 1, 2, 3, 5, 7, 10, 14, 21, 30, 60, 90),
            registry=self.registry,
        )

    def record_trip_created(self, trip: Trip) -> None:
        city = trip.city_slug if trip.city_slug in self.cities else "other"
        self.trips_created.labels(city_slug=city).inc()
        budget = "unspecified" if trip.budget_tier is None else str(trip.budget_tier)
        if budget not in {"1", "2", "3", "unspecified"}:
            budget = "other"
        self.trip_budget_tier.labels(budget_tier=budget).inc()
        pace = (trip.pace_preference or "").strip().lower()
        if not pace:
            pace = "unspecified"
        elif pace not in {"relaxed", "balanced", "intense"}:
            pace = "other"
        self.trip_pace_preference.labels(pace_preference=pace).inc()
        if trip.duration_days is not None:
            self.trip_duration_days.observe(trip.duration_days)


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
