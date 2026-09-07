"""JWT issuing and verification.

Tokens carry the whole Principal (sub, email, role) so a service without
database access can authenticate callers on its own. Settings are passed
in explicitly: this module owns no global state.
"""

from datetime import UTC, datetime, timedelta

import jwt

from travel_common.config import CommonSettings
from travel_common.exceptions import Unauthorized
from travel_common.principal import Principal, Role


def create_access_token(principal: Principal, settings: CommonSettings) -> str:
    expire = datetime.now(UTC) + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    payload = {
        "sub": str(principal.id),
        "email": principal.email,
        "role": principal.role.value,
        "exp": expire,
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def decode_access_token(token: str, settings: CommonSettings) -> dict:
    """Decode and verify a JWT. Raises `Unauthorized` on any failure."""
    try:
        return jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
    except jwt.PyJWTError as exc:
        # PyJWTError also covers InvalidKeyError (empty/invalid SECRET_KEY),
        # which is not an InvalidTokenError and would otherwise surface as a 500.
        raise Unauthorized("Invalid or expired token") from exc


def principal_from_token(token: str, settings: CommonSettings) -> Principal:
    """Rebuild the Principal from token claims alone (no database)."""
    claims = decode_access_token(token, settings)
    try:
        return Principal(
            id=int(claims["sub"]),
            email=str(claims["email"]),
            role=Role(claims["role"]),
        )
    except (KeyError, ValueError, TypeError) as exc:
        raise Unauthorized("Invalid authentication credentials") from exc
