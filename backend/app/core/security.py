import logging

import httpx
import jwt
from datetime import datetime, timedelta, timezone

from app.core.config import settings

logger = logging.getLogger(__name__)


def create_access_token(subject: str | int) -> str:
    expire = datetime.now(timezone.utc) + timedelta(
        minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES
    )
    to_encode = {"exp": expire, "sub": str(subject)}
    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def decode_access_token(token: str) -> dict:
    """Decode and verify a JWT token. Raises jwt exceptions on failure."""
    return jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])


async def verify_google_token(id_token: str) -> dict:
    """Verify Google ID token via Google's tokeninfo endpoint.

    Returns user info dict with keys: sub, email, name, picture, aud.
    Raises ValueError if token is invalid or audience doesn't match.
    """
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.get(
            f"https://oauth2.googleapis.com/tokeninfo?id_token={id_token}"
        )

    if resp.status_code != 200:
        logger.warning("Google token verification failed: %s", resp.text)
        raise ValueError("Invalid Google token")

    data = resp.json()

    # Verify the token was issued for our app
    if data.get("aud") != settings.GOOGLE_CLIENT_ID:
        logger.warning("Google token audience mismatch: %s", data.get("aud"))
        raise ValueError("Token audience mismatch")

    return data
