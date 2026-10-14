"""Persisted creation events are private, parseable, and independent observers."""

import hashlib
import json
import logging
from unittest.mock import AsyncMock
from uuid import UUID, uuid4

import pytest
from core_api.api.deps import get_table
from core_api.config import get_settings
from core_api.domain.models import Trip, User
from core_api.domain.ports import TripRepository
from core_api.infrastructure.dynamo.table import DynamoTable
from core_api.main import build_app
from core_api.observability.business_events import BusinessEventRecorder
from core_api.observability.business_metrics import BusinessMetrics
from core_api.schemas.trip import TripCreate
from core_api.services.trip_service import TripService
from httpx import ASGITransport, AsyncClient
from travel_common.http.logging import FORMAT

from tests.conftest import headers_for, trip_body

EVENT_LOGGER = "core_api.observability.business_events"


def events(caplog: pytest.LogCaptureFixture) -> list[dict]:
    lines = [
        logging.Formatter(FORMAT).format(record)
        for record in caplog.records
        if record.name == EVENT_LOGGER and "business_event=" in record.getMessage()
    ]
    # Parse exactly what CloudWatch gets, including the shared formatter prefix.
    return [json.loads(line.split("business_event=", 1)[1]) for line in lines]


@pytest.mark.parametrize("duration", [None, 0, 5])
async def test_lambda_api_emits_private_snapshot_without_metrics(
    table: DynamoTable,
    alice: User,
    caplog: pytest.LogCaptureFixture,
    duration: int | None,
):
    settings = get_settings().model_copy(
        update={
            "BUSINESS_EVENTS_ENABLED": True,
            "METRICS_ENABLED": True,
            "AWS_LAMBDA_FUNCTION_NAME": "core-api",
            "LOG_LEVEL": "WARNING",
        }
    )
    application = build_app(settings)
    application.dependency_overrides[get_table] = lambda: table
    logging.getLogger().addHandler(caplog.handler)
    assert not hasattr(application.state, "business_metrics")
    async with AsyncClient(
        transport=ASGITransport(app=application), base_url="http://test"
    ) as client:
        response = await client.post(
            "/api/v1/trips/",
            headers=headers_for(alice),
            json=trip_body(
                title="private title",
                description="private description",
                city_slug="secret-arbitrary-destination",
                budget_tier=2,
                pace_preference="private unrecognized pace",
                duration_days=duration,
                planner_session_id=str(uuid4()),
            ),
        )
        assert response.status_code == 201, response.text
        saved = response.json()
        event = events(caplog)[0]
        assert event == {
            "event": "trip_created",
            "version": 1,
            "event_id": hashlib.sha256(UUID(saved["id"]).bytes).hexdigest(),
            "city_slug": "other",
            "budget_tier": "2",
            "pace_preference": "other",
            "duration_days": duration,
            "created_at": event["created_at"],
        }
        assert event["created_at"].replace("+00:00", "Z") == saved["created_at"]
        raw = json.dumps(event)
        for private in (
            saved["id"],
            str(alice.id),
            alice.email,
            saved["title"],
            saved["description"],
            saved["pace_preference"],
            saved["planner_session_id"],
        ):
            assert private not in raw
        assert (await client.get("/metrics")).status_code == 404
        path = f"/api/v1/trips/{saved['id']}"
        assert (
            await client.patch(
                path, json={"title": "edited"}, headers=headers_for(alice)
            )
        ).status_code == 200
        assert (
            await client.delete(path, headers=headers_for(alice))
        ).status_code == 204
        assert len(events(caplog)) == 1


async def test_disabled_event_adapter_does_not_log(
    table: DynamoTable,
    alice: User,
    caplog: pytest.LogCaptureFixture,
):
    application = build_app(
        get_settings().model_copy(
            update={
                "BUSINESS_EVENTS_ENABLED": False,
                "METRICS_ENABLED": False,
            }
        )
    )
    application.dependency_overrides[get_table] = lambda: table
    logging.getLogger().addHandler(caplog.handler)
    async with AsyncClient(
        transport=ASGITransport(app=application), base_url="http://test"
    ) as client:
        assert (
            await client.post(
                "/api/v1/trips/", json=trip_body(), headers=headers_for(alice)
            )
        ).status_code == 201
    assert events(caplog) == []


async def test_event_uses_persisted_trip_and_stable_identity(
    caplog: pytest.LogCaptureFixture,
):
    recorder = BusinessEventRecorder(["budapest"])
    repository = AsyncMock(spec=TripRepository)
    saved = Trip(
        **trip_body(budget_tier=3, pace_preference=" ReLaXeD ", duration_days=0),
        user_id=uuid4(),
    )
    repository.add.return_value = saved
    await TripService(repository, recorder.record_trip_created).create(
        TripCreate(
            **trip_body(budget_tier=1, pace_preference="intense", duration_days=7)
        ),
        user_id=saved.user_id,
    )
    recorder.record_trip_created(saved)
    first, repeated = events(caplog)
    assert first == repeated
    assert first["event_id"] == hashlib.sha256(saved.id.bytes).hexdigest()
    assert (first["budget_tier"], first["pace_preference"], first["duration_days"]) == (
        "3",
        "relaxed",
        0,
    )
    repository.add.side_effect = RuntimeError("storage unavailable")
    with pytest.raises(RuntimeError, match="storage unavailable"):
        await TripService(repository, recorder.record_trip_created).create(
            TripCreate(**trip_body()),
            user_id=saved.user_id,
        )
    assert len(events(caplog)) == 2


@pytest.mark.parametrize("failing", ["metrics", "events"])
async def test_real_dependency_observer_failure_isolation(
    table: DynamoTable,
    alice: User,
    caplog: pytest.LogCaptureFixture,
    monkeypatch: pytest.MonkeyPatch,
    failing: str,
):
    def broken(self: object, trip: Trip) -> None:
        raise RuntimeError("private arbitrary exception details")

    if failing == "metrics":
        monkeypatch.setattr(BusinessMetrics, "record_trip_created", broken)
    else:
        monkeypatch.setattr(BusinessEventRecorder, "record_trip_created", broken)
    application = build_app(
        get_settings().model_copy(
            update={
                "BUSINESS_EVENTS_ENABLED": True,
                "METRICS_ENABLED": True,
            }
        )
    )
    application.dependency_overrides[get_table] = lambda: table
    logging.getLogger().addHandler(caplog.handler)
    async with AsyncClient(
        transport=ASGITransport(app=application), base_url="http://test"
    ) as client:
        assert (
            await client.post(
                "/api/v1/trips/", json=trip_body(), headers=headers_for(alice)
            )
        ).status_code == 201
    if failing == "metrics":
        assert len(events(caplog)) == 1
        event = events(caplog)[0]
        assert event["budget_tier"] == "unspecified"
        assert event["pace_preference"] == "unspecified"
        assert event["duration_days"] is None
    else:
        assert events(caplog) == []
        assert (
            application.state.business_metrics.registry.get_sample_value(
                "trips_created_total", {"city_slug": "budapest"}
            )
            == 1
        )
    assert "private arbitrary exception details" not in caplog.text
