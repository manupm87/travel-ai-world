"""Versioned, bounded creation events on the existing application log stream."""

import hashlib
import json
import logging
from collections.abc import Callable

from fastapi import FastAPI

from core_api.config import CoreSettings
from core_api.domain.models import Trip

logger = logging.getLogger(__name__)


def budget_category(value: int | None) -> str:
    if value is None:
        return "unspecified"
    return str(value) if value in {1, 2, 3} else "other"


def pace_category(value: str | None) -> str:
    normalized = (value or "").strip().lower()
    if not normalized:
        return "unspecified"
    return normalized if normalized in {"relaxed", "balanced", "intense"} else "other"


class BusinessEventRecorder:
    def __init__(self, cities: list[str]) -> None:
        self.cities = frozenset(cities)
        # An explicitly enabled event must not disappear when global logging is
        # WARNING. Ancestor logger levels do not filter a propagated INFO record.
        logger.setLevel(logging.INFO)

    def record_trip_created(self, trip: Trip) -> None:
        event = {
            "version": 1,
            "event": "trip_created",
            "event_id": hashlib.sha256(trip.id.bytes).hexdigest(),
            "city_slug": trip.city_slug if trip.city_slug in self.cities else "other",
            "budget_tier": budget_category(trip.budget_tier),
            "pace_preference": pace_category(trip.pace_preference),
            "duration_days": trip.duration_days,
            "created_at": trip.created_at.isoformat(),
        }
        logger.info("business_event=%s", json.dumps(event, separators=(",", ":")))


class TripCreationObservers:
    """Independent inline observers: one failure never suppresses another."""

    def __init__(self, observers: list[Callable[[Trip], None]]) -> None:
        self.observers = tuple(observers)

    def __call__(self, trip: Trip) -> None:
        for observer in self.observers:
            try:
                observer(trip)
            except Exception:
                # Do not log arbitrary exception messages or trip contents.
                logger.error("Trip creation observer failed")


def configure_business_events(app: FastAPI, settings: CoreSettings) -> None:
    observers: list[Callable[[Trip], None]] = []
    metrics_observer = app.state.record_trip_created
    if metrics_observer is not None:
        observers.append(metrics_observer)
    if settings.BUSINESS_EVENTS_ENABLED:
        events = BusinessEventRecorder(settings.METRICS_CITY_SLUGS)
        observers.append(events.record_trip_created)
    app.state.record_trip_created = (
        TripCreationObservers(observers) if observers else None
    )
