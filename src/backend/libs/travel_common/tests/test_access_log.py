import asyncio
import json
import logging
from io import StringIO
from types import SimpleNamespace
from uuid import uuid4

import pytest
from fastapi import APIRouter
from httpx import ASGITransport, AsyncClient
from starlette.types import Message, Scope
from travel_common.config import CommonSettings
from travel_common.exceptions import EntityNotFound
from travel_common.http import access_log
from travel_common.http.access_log import AccessLogMiddleware
from travel_common.http.app_factory import create_app
from travel_common.http.logging import FORMAT


@pytest.fixture
def events(monkeypatch):
    result = []

    def capture(message, *args):
        result.append(json.loads((message % args).split("access_log=", 1)[1]))

    monkeypatch.setattr(access_log.logger, "info", capture)
    return result


def app_for(*, enabled=True, log_level="INFO"):
    router = APIRouter()

    @router.get("/items/{item_id}")
    async def item(item_id: str):
        return {"id": item_id}

    @router.get("/missing/{item_id}")
    async def missing(item_id: str):
        raise EntityNotFound("Item", item_id)

    @router.get("/broken")
    async def broken():
        raise RuntimeError("private exception detail")

    @router.get("/health/")
    async def health():
        return {"ok": True}

    return create_app(
        CommonSettings(
            _env_file=None,
            SECRET_KEY="test",
            ACCESS_LOG_ENABLED=enabled,
            LOG_LEVEL=log_level,
        ),
        [router],
    )


async def test_disabled_default_has_no_access_event(events):
    assert CommonSettings(_env_file=None).ACCESS_LOG_ENABLED is False
    async with AsyncClient(
        transport=ASGITransport(app=app_for(enabled=False)), base_url="http://test"
    ) as client:
        assert (await client.get("/api/v1/health/")).status_code == 200
    assert events == []


async def test_route_template_and_unmatched_events_have_no_request_data(events):
    secret_id = "private-person@example.com"
    async with AsyncClient(
        transport=ASGITransport(app=app_for()), base_url="http://test"
    ) as client:
        response = await client.get(
            f"/api/v1/items/{secret_id}?token=private-query",
            headers={
                "authorization": "Bearer private-token",
                "x-request-id": secret_id,
            },
        )
        assert response.status_code == 200
        assert (await client.get(f"/unknown/{secret_id}")).status_code == 404
    assert len(events) == 2
    assert events[0]["route"] == "/api/v1/items/{item_id}"
    assert events[1]["route"] == "__unmatched__"
    assert events[0]["status"] == 200
    assert events[1]["status"] == 404
    assert events[0]["duration_ms"] >= 0
    assert events[0]["request_id"] is None
    assert events[0]["cold_start"] is False
    serialized = json.dumps(events)
    for secret in (secret_id, "private-query", "private-token"):
        assert secret not in serialized


async def test_domain404_and_unhandled500_are_recorded_without_exception_text(events):
    async with AsyncClient(
        transport=ASGITransport(app=app_for(), raise_app_exceptions=False),
        base_url="http://test",
    ) as client:
        assert (await client.get("/api/v1/missing/private-id")).status_code == 404
        assert (await client.get("/api/v1/broken")).status_code == 500
    assert [e["status"] for e in events] == [404, 500]
    assert [e["outcome"] for e in events] == ["response_ready", "interrupted"]
    assert "private-id" not in json.dumps(events)
    assert "private exception detail" not in json.dumps(events)


async def test_readiness_does_not_consume_first_lambda_invocation(events, monkeypatch):
    monkeypatch.setenv("AWS_LAMBDA_FUNCTION_NAME", "test-function")
    monkeypatch.setenv("AWS_LWA_READINESS_CHECK_PATH", "/api/v1/health/")
    async with AsyncClient(
        transport=ASGITransport(app=app_for()), base_url="http://test"
    ) as client:
        await client.get("/api/v1/health/")
        assert events == []
        for _ in range(2):
            request_id = str(uuid4())
            await client.get(
                "/api/v1/items/test",
                headers={
                    "x-amzn-lambda-context": json.dumps({"request_id": request_id})
                },
            )
            assert events[-1]["request_id"] == request_id
    assert [e["cold_start"] for e in events] == [True, False]


@pytest.mark.parametrize(
    "context",
    [
        '{"request_id":"person@example.com"}',
        "not-json",
        "[]",
        "[" * 1500 + "0" + "]" * 1500,
    ],
)
async def test_invalid_context_never_leaks_or_consumes_cold_start(
    events, monkeypatch, context
):
    monkeypatch.setenv("AWS_LAMBDA_FUNCTION_NAME", "test-function")
    async with AsyncClient(
        transport=ASGITransport(app=app_for()), base_url="http://test"
    ) as client:
        await client.get(
            "/api/v1/items/test", headers={"x-amzn-lambda-context": context}
        )
        await client.get(
            "/api/v1/items/test",
            headers={
                "x-amzn-lambda-context": json.dumps({"request_id": str(uuid4())}),
            },
        )
    assert events[0]["request_id"] is None
    assert events[0]["cold_start"] is False
    assert events[1]["cold_start"] is True
    assert "person@example.com" not in json.dumps(events)


async def test_nested_reused_router_logs_each_full_template(events):
    leaf = APIRouter()

    @leaf.get("/{item_id}")
    async def item(item_id: str):
        return {"ok": True}

    outer = APIRouter()
    outer.include_router(leaf, prefix="/first")
    outer.include_router(leaf, prefix="/second")
    app = create_app(
        CommonSettings(_env_file=None, SECRET_KEY="test", ACCESS_LOG_ENABLED=True),
        [outer],
    )
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        await client.get("/api/v1/first/private-one")
        await client.get("/api/v1/second/private-two")
    assert [e["route"] for e in events] == [
        "/api/v1/first/{item_id}",
        "/api/v1/second/{item_id}",
    ]
    assert "private-" not in json.dumps(events)


@pytest.mark.parametrize("trailers", [False, True])
async def test_stream_event_precedes_final_body_or_trailer(
    events, monkeypatch, trailers
):
    clock = iter([1.0, 3.0])
    monkeypatch.setattr(access_log, "perf_counter", lambda: next(clock))
    observed = []

    async def stream(scope, receive, send):
        await send({"type": "http.response.start", "status": 200, "trailers": trailers})
        await send({"type": "http.response.body", "body": b"first", "more_body": True})
        assert events == []
        await send({"type": "http.response.body", "body": b"last", "more_body": False})
        if trailers:
            assert events == []
            await send(
                {"type": "http.response.trailers", "headers": [], "more_trailers": True}
            )
            assert events == []
            await send(
                {
                    "type": "http.response.trailers",
                    "headers": [],
                    "more_trailers": False,
                }
            )

    async def receive():
        return {"type": "http.request", "body": b"", "more_body": False}

    async def send(message):
        observed.append((message["type"], len(events)))

    scope: Scope = {
        "type": "http",
        "method": "GET",
        "headers": [],
        "route": SimpleNamespace(path="/stream"),
    }
    await AccessLogMiddleware(stream)(scope, receive, send)
    assert len(events) == 1
    assert events[0]["duration_ms"] == 2000
    assert events[0]["outcome"] == "response_ready"
    assert observed[1] == ("http.response.body", 0)
    assert observed[-1][1] == 1


@pytest.mark.parametrize("failure", [RuntimeError, asyncio.CancelledError])
async def test_interrupted_stream_retains_status_and_reraises(events, failure):
    async def stream(scope, receive, send):
        await send({"type": "http.response.start", "status": 200})
        await send({"type": "http.response.body", "body": b"first", "more_body": True})
        raise failure("private detail")

    async def receive():
        return {"type": "http.request"}

    async def send(message):
        pass

    with pytest.raises(failure):
        await AccessLogMiddleware(stream)(
            {"type": "http", "method": "GET", "headers": []}, receive, send
        )
    assert len(events) == 1
    assert events[0]["status"] == 200
    assert events[0]["outcome"] == "interrupted"
    assert "private detail" not in json.dumps(events)


async def test_terminal_send_failure_is_not_swallowed_or_logged_twice(events):
    async def response(scope, receive, send):
        await send({"type": "http.response.start", "status": 201})
        await send({"type": "http.response.body", "body": b"ok"})

    async def receive():
        return {"type": "http.request"}

    async def send(message: Message):
        if message["type"] == "http.response.body":
            assert len(events) == 1
            raise OSError("client gone")

    with pytest.raises(OSError, match="client gone"):
        await AccessLogMiddleware(response)(
            {"type": "http", "method": "CUSTOM-sensitive", "headers": []}, receive, send
        )
    assert len(events) == 1
    assert events[0]["method"] == "OTHER"
    assert events[0]["status"] == 201


async def test_graceful_disconnect_without_terminal_message_is_interrupted(events):
    async def partial_response(scope, receive, send):
        await send({"type": "http.response.start", "status": 202})
        await send(
            {"type": "http.response.body", "body": b"partial", "more_body": True}
        )

    async def receive():
        return {"type": "http.disconnect"}

    async def send(message):
        pass

    await AccessLogMiddleware(partial_response)(
        {"type": "http", "method": "GET", "headers": []}, receive, send
    )
    assert len(events) == 1
    assert events[0]["status"] == 202
    assert events[0]["outcome"] == "interrupted"


async def test_logging_failure_does_not_change_http_response(monkeypatch):
    def fail(*args):
        raise RuntimeError("handler failed")

    monkeypatch.setattr(access_log.logger, "info", fail)
    async with AsyncClient(
        transport=ASGITransport(app=app_for()), base_url="http://test"
    ) as client:
        assert (await client.get("/api/v1/health/")).status_code == 200


async def test_event_emits_with_real_formatter_at_warning_root_level():
    app = app_for(log_level="WARNING")
    output = StringIO()
    handler = logging.StreamHandler(output)
    handler.setFormatter(logging.Formatter(FORMAT))
    access_log.logger.addHandler(handler)
    try:
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            await client.get("/api/v1/health/")
    finally:
        access_log.logger.removeHandler(handler)
    line = output.getvalue()
    payload = json.loads(line.split("access_log=", 1)[1])
    assert payload["version"] == 1
    assert payload["route"] == "/api/v1/health/"
    assert len(line.splitlines()) == 1
