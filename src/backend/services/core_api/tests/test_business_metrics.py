"""Local metrics exercise the actual service/dependency and HTTP boundaries."""

from unittest.mock import AsyncMock
from uuid import uuid4

import pytest
from core_api.api.deps import get_table
from core_api.config import CoreSettings, get_settings
from core_api.domain.models import Trip, User
from core_api.domain.ports import TripRepository
from core_api.infrastructure.dynamo.table import DynamoTable
from core_api.main import build_app
from core_api.observability.business_metrics import BusinessMetrics
from core_api.schemas.trip import TripCreate
from core_api.services.trip_service import TripService
from httpx import ASGITransport, AsyncClient
from prometheus_client import CONTENT_TYPE_LATEST

from tests.conftest import headers_for, trip_body


def value(metrics: BusinessMetrics, city: str) -> float | None:
    return metrics.registry.get_sample_value("trips_created_total", {"city_slug": city})


def snapshot(metrics: BusinessMetrics) -> dict[tuple[str, tuple], float]:
    return {
        (sample.name, tuple(sorted(sample.labels.items()))): sample.value
        for metric in metrics.registry.collect()
        for sample in metric.samples
    }


async def test_create_only_counts_successful_persistence():
    metrics = BusinessMetrics(["budapest"])
    repository = AsyncMock(spec=TripRepository)
    repository.add.side_effect = lambda trip: trip
    service = TripService(repository, metrics.record_trip_created)
    assert value(metrics, "budapest") == 0
    await service.create(
        TripCreate(
            **trip_body(budget_tier=2, pace_preference="balanced", duration_days=5)
        ),
        user_id=uuid4(),
    )
    assert value(metrics, "budapest") == 1
    before_failure = snapshot(metrics)
    repository.add.side_effect = RuntimeError("database unavailable")
    with pytest.raises(RuntimeError, match="database unavailable"):
        await service.create(TripCreate(**trip_body()), user_id=uuid4())
    assert value(metrics, "budapest") == 1
    assert snapshot(metrics) == before_failure


async def test_observer_receives_saved_trip():
    metrics = BusinessMetrics(["budapest"])
    repository = AsyncMock(spec=TripRepository)
    saved = Trip(
        **trip_body(budget_tier=3, pace_preference="intense", duration_days=7),
        user_id=uuid4(),
    )
    repository.add.return_value = saved
    result = await TripService(repository, metrics.record_trip_created).create(
        TripCreate(**trip_body(budget_tier=1, duration_days=2)), user_id=saved.user_id
    )
    assert result is saved
    assert (
        metrics.registry.get_sample_value(
            "trip_budget_tier_total", {"budget_tier": "3"}
        )
        == 1
    )
    assert metrics.registry.get_sample_value("trip_duration_days_sum") == 7


async def test_observer_failure_does_not_fail_committed_creation():
    repository = AsyncMock(spec=TripRepository)
    repository.add.side_effect = lambda trip: trip

    def broken_observer(trip: Trip) -> None:
        raise RuntimeError("observer unavailable")

    saved = await TripService(repository, broken_observer).create(
        TripCreate(**trip_body()), user_id=uuid4()
    )
    assert saved.city_slug == "budapest"
    repository.add.assert_awaited_once()


async def test_http_wiring_scrape_update_delete_and_unknown_city(
    table: DynamoTable, alice: User
):
    settings = get_settings().model_copy(update={"METRICS_ENABLED": True})
    application = build_app(settings)
    application.dependency_overrides[get_table] = lambda: table
    metrics = application.state.business_metrics
    async with AsyncClient(
        transport=ASGITransport(app=application), base_url="http://test"
    ) as client:
        initial = await client.get("/metrics")
        assert initial.status_code == 200
        assert initial.headers["content-type"] == CONTENT_TYPE_LATEST
        assert 'trips_created_total{city_slug="budapest"} 0.0' in initial.text
        assert "/metrics" not in application.openapi()["paths"]
        created = await client.post(
            "/api/v1/trips/",
            json=trip_body(budget_tier=2, pace_preference="balanced", duration_days=5),
            headers=headers_for(alice),
        )
        assert created.status_code == 201, created.text
        assert (
            metrics.registry.get_sample_value(
                "trip_budget_tier_total", {"budget_tier": "2"}
            )
            == 1
        )
        assert (
            metrics.registry.get_sample_value(
                "trip_pace_preference_total", {"pace_preference": "balanced"}
            )
            == 1
        )
        assert metrics.registry.get_sample_value("trip_duration_days_sum") == 5
        assert metrics.registry.get_sample_value("trip_duration_days_count") == 1
        assert (
            metrics.registry.get_sample_value(
                "trip_duration_days_bucket", {"le": "5.0"}
            )
            == 1
        )
        before_update = snapshot(metrics)
        path = f"/api/v1/trips/{created.json()['id']}"
        assert (
            await client.patch(
                path,
                json={
                    "budget_tier": 3,
                    "pace_preference": "intense",
                    "duration_days": 7,
                },
                headers=headers_for(alice),
            )
        ).status_code == 200
        assert (
            await client.delete(path, headers=headers_for(alice))
        ).status_code == 204
        assert value(metrics, "budapest") == 1
        assert snapshot(metrics) == before_update
        assert (
            await client.post(
                "/api/v1/trips/",
                json=trip_body(city_slug="unlisted"),
                headers=headers_for(alice),
            )
        ).status_code == 201
        assert value(metrics, "other") == 1
        assert value(metrics, "unlisted") is None
        scraped = await client.get("/metrics")
        assert 'trips_created_total{city_slug="budapest"} 1.0' in scraped.text
        assert 'trips_created_total{city_slug="other"} 1.0' in scraped.text
    other_app = build_app(settings)
    assert value(other_app.state.business_metrics, "budapest") == 0
    assert (
        other_app.state.business_metrics.registry.get_sample_value(
            "trip_duration_days_count"
        )
        == 0
    )


@pytest.mark.parametrize(
    "fields,budget,pace,duration_count,duration_sum",
    [
        (
            {"budget_tier": None, "pace_preference": None, "duration_days": None},
            "unspecified",
            "unspecified",
            0,
            0,
        ),
        (
            {"pace_preference": "   ", "duration_days": 0},
            "unspecified",
            "unspecified",
            1,
            0,
        ),
        ({"budget_tier": 1, "pace_preference": " ReLaXeD "}, "1", "relaxed", 0, 0),
        ({"budget_tier": 3, "pace_preference": "INTENSE"}, "3", "intense", 0, 0),
        ({"pace_preference": "my very personal pace"}, "unspecified", "other", 0, 0),
        # Dates must never be used to infer an absent duration.
        (
            {"start_date": "2090-01-01", "end_date": "2090-01-05"},
            "unspecified",
            "unspecified",
            0,
            0,
        ),
    ],
)
async def test_profile_categories_and_only_explicit_duration(
    table: DynamoTable,
    alice: User,
    fields: dict[str, object],
    budget: str,
    pace: str,
    duration_count: int,
    duration_sum: int,
):
    application = build_app(get_settings().model_copy(update={"METRICS_ENABLED": True}))
    application.dependency_overrides[get_table] = lambda: table
    metrics = application.state.business_metrics
    async with AsyncClient(
        transport=ASGITransport(app=application), base_url="http://test"
    ) as client:
        response = await client.post(
            "/api/v1/trips/", json=trip_body(**fields), headers=headers_for(alice)
        )
        assert response.status_code == 201, response.text
        assert (
            metrics.registry.get_sample_value(
                "trip_budget_tier_total", {"budget_tier": budget}
            )
            == 1
        )
        assert (
            metrics.registry.get_sample_value(
                "trip_pace_preference_total", {"pace_preference": pace}
            )
            == 1
        )
        assert (
            metrics.registry.get_sample_value("trip_duration_days_count")
            == duration_count
        )
        assert (
            metrics.registry.get_sample_value("trip_duration_days_sum") == duration_sum
        )
        assert (
            metrics.registry.get_sample_value(
                "trip_duration_days_bucket", {"le": "0.0"}
            )
            == duration_count
        )
        scraped = await client.get("/metrics")
        assert f'trip_budget_tier_total{{budget_tier="{budget}"}} 1.0' in scraped.text
        assert (
            f'trip_pace_preference_total{{pace_preference="{pace}"}} 1.0'
            in scraped.text
        )


@pytest.mark.parametrize("enabled,on_lambda", [(False, False), (True, True)])
async def test_disabled_or_lambda_has_no_metrics(enabled: bool, on_lambda: bool):
    application = build_app(
        CoreSettings(
            METRICS_ENABLED=enabled,
            AWS_LAMBDA_FUNCTION_NAME="core-api" if on_lambda else "",
        )
    )
    assert application.state.record_trip_created is None
    assert not hasattr(application.state, "business_metrics")
    async with AsyncClient(
        transport=ASGITransport(app=application), base_url="http://test"
    ) as client:
        assert (await client.get("/metrics")).status_code == 404


@pytest.mark.parametrize(
    "variable,value",
    [("WEB_CONCURRENCY", "2"), ("PROMETHEUS_MULTIPROC_DIR", "metrics-test-directory")],
)
def test_rejects_multiprocess(
    variable: str, value: str, monkeypatch: pytest.MonkeyPatch
):
    monkeypatch.setenv(variable, value)
    with pytest.raises(ValueError, match="one worker"):
        build_app(CoreSettings(METRICS_ENABLED=True))
