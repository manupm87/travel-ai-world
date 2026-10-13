"""Business metrics exposed through prometheus_client's default registry."""

from prometheus_client import Counter


TRIPS_CREATED = Counter(
    "trips_created_total",
    "Number of new trips successfully persisted.",
    labelnames=("city_slug",),
)


def record_trip_created(city_slug: str) -> None:
    """Call once after successfully persisting a new trip.

    Pass the canonical city slug from the destination catalog. Do not call
    for updates, failed writes, or retries returning an existing trip.
    """
    if not isinstance(city_slug, str) or not city_slug.strip():
        raise ValueError("city_slug must be a non-empty canonical city slug")
    TRIPS_CREATED.labels(city_slug=city_slug.strip().lower()).inc()
