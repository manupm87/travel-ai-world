"""Offline verification of Amazon Cognito ID tokens.

The user pool signs tokens with RS256; its public keys are the JWKS document
at `<issuer>/.well-known/jwks.json`. That document arrives as configuration
(`COGNITO_JWKS`), so a service verifies tokens without network access. The
`admin` role is a user pool group.
"""

import json
import logging
from functools import lru_cache
from typing import Any

import jwt
from jwt import PyJWKSet

from travel_common.config import CommonSettings
from travel_common.exceptions import Unauthorized
from travel_common.principal import Claims, Role

logger = logging.getLogger(__name__)

ADMIN_GROUP = "admin"
_GROUPS_CLAIM = "cognito:groups"


@lru_cache(maxsize=4)
def _jwk_set(raw_jwks: str) -> PyJWKSet:
    """Parse the JWKS once per distinct configuration value."""
    return PyJWKSet.from_dict(json.loads(raw_jwks))


def decode_cognito_token(token: str, settings: CommonSettings) -> dict[str, Any]:
    """Verify signature, expiry, issuer, audience and token type.

    Raises `Unauthorized` on any failure, including a missing configuration:
    a misconfigured service must refuse callers, not let them through.
    """
    if not (
        settings.COGNITO_JWKS and settings.COGNITO_ISSUER and settings.COGNITO_CLIENT_ID
    ):
        logger.error("AUTH_MODE=cognito but COGNITO_* settings are incomplete")
        raise Unauthorized("Token verification is not configured")
    try:
        kid = jwt.get_unverified_header(token).get("kid", "")
        key = _jwk_set(settings.COGNITO_JWKS)[kid]
        claims = jwt.decode(
            token,
            key=key.key,
            algorithms=["RS256"],
            audience=settings.COGNITO_CLIENT_ID,
            issuer=settings.COGNITO_ISSUER,
            options={"require": ["exp", "iat", "sub"]},
        )
    except (jwt.PyJWTError, KeyError, ValueError) as exc:
        # KeyError: unknown `kid`; ValueError: unparsable JWKS. Both are 401s,
        # never 500s, and the log line says which one it was.
        logger.info("Cognito token rejected: %s", exc)
        raise Unauthorized("Invalid or expired token") from exc

    # Only ID tokens carry email and profile; access tokens name a client, not a person.
    if claims.get("token_use") != "id":
        raise Unauthorized("Not an ID token")
    return claims


def claims_from_cognito(payload: dict[str, Any]) -> Claims:
    """Map the pool's claim names to ours. `sub` and `email` are required."""
    groups = payload.get(_GROUPS_CLAIM) or []
    subject, email = payload.get("sub"), payload.get("email")
    if not subject or not email:
        raise Unauthorized("Token is missing required claims")
    return Claims(
        subject=str(subject),
        email=str(email),
        role=Role.ADMIN if ADMIN_GROUP in groups else Role.USER,
        name=str(payload.get("name") or ""),
        picture=payload.get("picture") or None,
    )


def verify_cognito_token(token: str, settings: CommonSettings) -> Claims:
    return claims_from_cognito(decode_cognito_token(token, settings))
