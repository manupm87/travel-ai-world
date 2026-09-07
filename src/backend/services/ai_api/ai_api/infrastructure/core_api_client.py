"""TripGateway adapter: talk to core_api over HTTP as the calling user.

The user's own bearer token is forwarded, so core_api applies exactly the
permissions it would apply to the browser. No service-to-service secret.
"""

from collections.abc import Callable
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

# core_api answers with domain errors of its own; re-raise the equivalent
# here so the caller sees the same status it would get from core_api.
_STATUS_TO_ERROR: dict[int, type[DomainError]] = {
    400: BadRequest,
    401: Unauthorized,
    403: Forbidden,
    404: EntityNotFound,
    422: UnprocessableEntity,
}


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

    async def create_trip(
        self, bearer_token: str, trip: dict[str, Any]
    ) -> dict[str, Any]:
        async with self._client_factory(timeout=10.0) as client:
            try:
                resp = await client.post(
                    f"{self._base}/trips/",
                    json=trip,
                    headers={"Authorization": f"Bearer {bearer_token}"},
                )
            except httpx.HTTPError as exc:
                raise ProviderUnavailable("core_api unreachable") from exc
        if resp.is_success:
            return resp.json()
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
