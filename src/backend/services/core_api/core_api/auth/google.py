"""Google ID token verification through Google's tokeninfo endpoint.

An adapter behind the `IdentityVerifier` protocol: the sign-in use case does
not know Google exists, and tests substitute a fake.
"""

import logging
from collections.abc import Callable
from dataclasses import dataclass
from typing import Protocol

import httpx
from travel_common.exceptions import Unauthorized

logger = logging.getLogger(__name__)

TOKENINFO_URL = "https://oauth2.googleapis.com/tokeninfo"


@dataclass(frozen=True, slots=True)
class ExternalIdentity:
    """What an identity provider tells us about the person signing in."""

    subject: str
    email: str
    name: str = ""
    picture: str | None = None


class IdentityVerifier(Protocol):
    async def verify(self, credential: str) -> ExternalIdentity:
        """Return the identity or raise `Unauthorized`."""
        ...


class GoogleTokenInfoVerifier:
    def __init__(
        self,
        client_id: str,
        *,
        client_factory: Callable[..., httpx.AsyncClient] = httpx.AsyncClient,
        timeout: float = 10.0,
    ) -> None:
        self._client_id = client_id
        self._client_factory = client_factory
        self._timeout = timeout

    async def verify(self, credential: str) -> ExternalIdentity:
        try:
            async with self._client_factory(timeout=self._timeout) as client:
                resp = await client.get(TOKENINFO_URL, params={"id_token": credential})
        except httpx.HTTPError as exc:
            logger.warning("Google tokeninfo unreachable: %s", exc)
            raise Unauthorized("Could not verify Google token") from exc

        if resp.status_code != 200:
            logger.warning("Google token verification failed: %s", resp.text)
            raise Unauthorized("Invalid Google token")

        data = resp.json()
        if data.get("aud") != self._client_id:
            logger.warning("Google token audience mismatch: %s", data.get("aud"))
            raise Unauthorized("Token audience mismatch")
        try:
            return ExternalIdentity(
                subject=str(data["sub"]),
                email=str(data["email"]),
                name=str(data.get("name", "")),
                picture=data.get("picture"),
            )
        except KeyError as exc:
            raise Unauthorized("Google token is missing required claims") from exc
