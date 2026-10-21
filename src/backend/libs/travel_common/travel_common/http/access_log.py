"""Small, bounded access events emitted before the final ASGI response message.

The final send may cause Lambda to freeze the process. Never defer the event to
after that send or to background work. Duration ends when that message is ready,
not when the client has received it. A one-bit per-environment lifecycle marker
identifies the first invocation; it is not a cross-request traffic counter.
"""

import json
import logging
import os
from contextlib import suppress
from time import perf_counter
from uuid import UUID

from starlette.types import ASGIApp, Message, Receive, Scope, Send

logger = logging.getLogger(__name__)
_METHODS = frozenset(
    {"GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "TRACE", "CONNECT"}
)


def _request_id(scope: Scope) -> str | None:
    """Take only the invocation UUID, never arbitrary client request headers."""
    for key, value in scope.get("headers", []):
        if key.lower() != b"x-amzn-lambda-context" or len(value) > 8192:
            continue
        try:
            context = json.loads(value)
            candidate = context.get("request_id") if isinstance(context, dict) else None
            if isinstance(candidate, str):
                return str(UUID(candidate))
        except (ValueError, TypeError, AttributeError, RecursionError):
            continue
    return None


def _route_template(scope: Scope) -> str:
    # FastAPI 0.141+ keeps the original route in scope["route"], and the
    # matched template including router prefixes in its effective context.
    # No fallback ever uses path/root_path: they can contain concrete IDs.
    fastapi_scope = scope.get("fastapi", {})
    context = (
        fastapi_scope.get("effective_route_context")
        if isinstance(fastapi_scope, dict)
        else None
    )
    route = context if context is not None else scope.get("route")
    template = getattr(route, "path", None)
    return (
        template
        if isinstance(template, str) and len(template) <= 512
        else "__unmatched__"
    )


class AccessLogMiddleware:
    def __init__(self, app: ASGIApp) -> None:
        self.app = app
        self.on_lambda = bool(os.getenv("AWS_LAMBDA_FUNCTION_NAME"))
        self.readiness_path = os.getenv("AWS_LWA_READINESS_CHECK_PATH", "")
        self.first_invocation = True
        # An explicit opt-in must still emit events if the root level is WARNING.
        logger.setLevel(logging.INFO)

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        request_id = _request_id(scope) if self.on_lambda else None
        if (
            self.on_lambda
            and request_id is None
            and self.readiness_path
            and scope.get("path") == self.readiness_path
        ):
            await self.app(scope, receive, send)
            return

        cold_start = self.on_lambda and request_id is not None and self.first_invocation
        if self.on_lambda and request_id is not None:
            self.first_invocation = False
        started = perf_counter()
        status = 500
        trailers = False
        emitted = False

        def emit(outcome: str) -> None:
            nonlocal emitted
            if emitted:
                return
            emitted = True
            method = scope.get("method", "")
            event = {
                "version": 1,
                "route": _route_template(scope),
                "method": method if method in _METHODS else "OTHER",
                "status": status,
                "duration_ms": round(max(0, perf_counter() - started) * 1000, 3),
                "request_id": request_id,
                "cold_start": cold_start,
                "outcome": outcome,
            }
            # Observability must never change the application response, even if
            # a configured logging handler fails.
            with suppress(Exception):
                logger.info("access_log=%s", json.dumps(event, separators=(",", ":")))

        async def observe(message: Message) -> None:
            nonlocal status, trailers
            if message["type"] == "http.response.start":
                await send(message)
                status = message["status"]
                trailers = message.get("trailers", False)
                return
            elif (
                message["type"] == "http.response.body"
                and not message.get("more_body", False)
                and not trailers
            ) or (
                message["type"] == "http.response.trailers"
                and not message.get("more_trailers", False)
            ):
                emit("response_ready")
            await send(message)

        try:
            await self.app(scope, receive, observe)
        except BaseException:
            # Before response.start the outer ServerErrorMiddleware sends 500.
            # Once started, keep the actual status even if a stream is interrupted.
            emit("interrupted")
            raise
        else:
            if not emitted:
                # StreamingResponse can finish on disconnect without raising
                # or producing a terminal body. No successful response was
                # completed in this branch.
                emit("interrupted")
