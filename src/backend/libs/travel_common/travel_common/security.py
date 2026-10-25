"""Token verification for both `AUTH_MODE`s (ADR 0009), and issuing for local mode.

Local tokens are HS256 with the shared `SECRET_KEY` and carry the whole Principal,
so a service without a database authenticates callers on its own.
"""

from datetime import UTC, datetime, timedelta

import jwt

from travel_common.cognito import verify_cognito_token
from travel_common.config import CommonSettings
from travel_common.exceptions import Unauthorized
from travel_common.principal import Claims, Principal, Role


def create_access_token(principal: Principal, settings: CommonSettings) -> str:
    """Issue a local-mode token. Only `core_api`'s sign-in calls this."""
    expire = datetime.now(UTC) + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    payload = {
        "sub": principal.subject,
        "email": principal.email,
        "role": principal.role.value,
        "exp": expire,
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def decode_access_token(token: str, settings: CommonSettings) -> dict:
    """Decode and verify a local-mode JWT; it must carry `exp` and `sub`.

    Raises:
        Unauthorized: any failure, an empty or invalid `SECRET_KEY` included.
    """
    try:
        return jwt.decode(
            token,
            settings.SECRET_KEY,
            algorithms=[settings.ALGORITHM],
            options={"require": ["exp", "sub"]},
        )
    except jwt.PyJWTError as exc:
        # PyJWTError also covers InvalidKeyError, which would otherwise be a 500
        raise Unauthorized("Invalid or expired token") from exc


def _claims_from_local(payload: dict) -> Claims:
    try:
        return Claims(
            subject=str(payload["sub"]),
            email=str(payload["email"]),
            role=Role(payload["role"]),
        )
    except (KeyError, ValueError, TypeError) as exc:
        raise Unauthorized("Invalid authentication credentials") from exc


def verify_token(token: str, settings: CommonSettings) -> Claims:
    """Verify a bearer token with whichever issuer `AUTH_MODE` names."""
    if settings.AUTH_MODE == "cognito":
        return verify_cognito_token(token, settings)
    return _claims_from_local(decode_access_token(token, settings))


def principal_from_token(token: str, settings: CommonSettings) -> Principal:
    """Rebuild the Principal from token claims alone (no database)."""
    return verify_token(token, settings).principal
