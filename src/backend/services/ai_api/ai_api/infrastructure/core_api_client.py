"""ConversationGateway and AccessGateway adapter: talk to core_api over HTTP
as the calling user.

The user's own bearer token is forwarded, so core_api applies exactly the
permissions it would apply to the browser. No service-to-service secret.
"""

from collections.abc import Callable
from dataclasses import asdict
from typing import Any

import httpx
from travel_common.exceptions import (
    BadRequest,
    DomainError,
    EntityNotFound,
    Forbidden,
    ProviderUnavailable,
    Unauthorized,
    UnprocessableEntity,
)

from ai_api.domain.models import ChatTurn
from ai_api.domain.usage import Entitlement

# core_api answers with domain errors of its own; re-raise the equivalent
# here so the caller sees the same status it would get from core_api.
_STATUS_TO_ERROR: dict[int, type[DomainError]] = {
    400: BadRequest,
    401: Unauthorized,
    403: Forbidden,
    404: EntityNotFound,
    422: UnprocessableEntity,
}


# A core_api that is not running must not hold the chat for long.
_TIMEOUT = httpx.Timeout(10.0, connect=3.0)


class CoreApiClient:
    def __init__(
        self,
        base_url: str,
        api_prefix: str = "/api/v1",
        *,
        client_factory: Callable[..., httpx.AsyncClient] = httpx.AsyncClient,
    ) -> None:
        self._base = f"{base_url.rstrip('/')}{api_prefix}"
        self._client_factory = client_factory

    async def start_thread(self, bearer_token: str) -> str:
        thread = await self._post(bearer_token, "/chat-threads/", {})
        return str(thread["id"])

    async def append_turn(
        self, bearer_token: str, thread_id: str, turn: ChatTurn
    ) -> None:
        body = asdict(turn)
        # A user turn carries no sources; core_api keeps `null`, not `[]`.
        body["sources"] = body["sources"] or None
        await self._post(bearer_token, f"/chat-threads/{thread_id}/messages/", body)

    async def access(self, bearer_token: str) -> Entitlement:
        """May the caller use the app, and their daily token limit (ADR 0026).

        Only core_api's 401 and 403 are the caller's own; any other refusal
        (400, 404, 422: a core_api without the route, a contract that moved)
        and a body of another shape are this service's failure to ask, so
        they are `ProviderUnavailable` (503), never a 4xx of the planner route
        that the browser would read as its own. A limit of zero or less is no
        limit.
        """
        try:
            body = await self._get(bearer_token, "/users/me/access")
        except (Unauthorized, Forbidden):
            raise
        except DomainError as exc:
            raise ProviderUnavailable("core_api could not answer the access") from exc
        allowed, limit = body.get("allowed"), body.get("daily_token_limit")
        if not isinstance(allowed, bool) or isinstance(limit, bool):
            raise ProviderUnavailable("core_api answered an unreadable access")
        if limit is not None and not isinstance(limit, int):
            raise ProviderUnavailable("core_api answered an unreadable access")
        if limit is not None and limit <= 0:
            limit = None
        return Entitlement(allowed=allowed, daily_token_limit=limit)

    async def _post(
        self, bearer_token: str, path: str, body: dict[str, Any]
    ) -> dict[str, Any]:
        return await self._request("POST", bearer_token, path, json=body)

    async def _get(self, bearer_token: str, path: str) -> dict[str, Any]:
        return await self._request("GET", bearer_token, path)

    async def _request(
        self, method: str, bearer_token: str, path: str, **kwargs: Any
    ) -> dict[str, Any]:
        async with self._client_factory(timeout=_TIMEOUT) as client:
            try:
                resp = await client.request(
                    method,
                    f"{self._base}{path}",
                    headers={"Authorization": f"Bearer {bearer_token}"},
                    **kwargs,
                )
            except httpx.HTTPError as exc:
                raise ProviderUnavailable("core_api unreachable") from exc
        if resp.is_success:
            try:
                body = resp.json()
            except ValueError as exc:
                raise ProviderUnavailable("core_api answered no JSON") from exc
            if not isinstance(body, dict):
                raise ProviderUnavailable("core_api answered no JSON object")
            return body
        error = _STATUS_TO_ERROR.get(resp.status_code)
        if error is None:
            raise ProviderUnavailable(f"core_api answered {resp.status_code}")
        raise error(_detail(resp))


def _detail(resp: httpx.Response) -> str:
    try:
        detail = resp.json().get("detail")
    except ValueError:
        detail = None
    return str(detail) if detail else f"core_api answered {resp.status_code}"
