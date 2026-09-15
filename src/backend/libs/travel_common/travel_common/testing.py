"""Test doubles shared by every package's tests.

`CognitoTestIssuer` stands in for a user pool: it owns an RSA key pair,
publishes the matching JWKS and signs ID tokens the way Cognito does, so a
service can prove it accepts the pool's tokens and rejects tampered ones
without any network access.
"""

import json
from datetime import UTC, datetime, timedelta
from typing import Any

import jwt
from cryptography.hazmat.primitives.asymmetric import rsa
from jwt.algorithms import RSAAlgorithm

DEFAULT_ISSUER = "https://cognito-idp.eu-west-1.amazonaws.com/eu-west-1_TESTPOOL"
DEFAULT_CLIENT_ID = "test-app-client-id"


class CognitoTestIssuer:
    def __init__(
        self,
        issuer: str = DEFAULT_ISSUER,
        client_id: str = DEFAULT_CLIENT_ID,
        kid: str = "test-key-1",
    ) -> None:
        self.issuer = issuer
        self.client_id = client_id
        self.kid = kid
        self._private_key = rsa.generate_private_key(
            public_exponent=65537, key_size=2048
        )

    def jwks(self) -> dict[str, Any]:
        """The pool's `.well-known/jwks.json` document."""
        public = RSAAlgorithm.to_jwk(self._private_key.public_key(), as_dict=True)
        return {"keys": [{**public, "kid": self.kid, "alg": "RS256", "use": "sig"}]}

    def settings_overrides(self) -> dict[str, Any]:
        """Keyword arguments that put a `CommonSettings` subclass in Cognito mode."""
        return {
            "AUTH_MODE": "cognito",
            "COGNITO_ISSUER": self.issuer,
            "COGNITO_CLIENT_ID": self.client_id,
            "COGNITO_JWKS": json.dumps(self.jwks()),
        }

    def id_token(
        self,
        *,
        sub: str = "11111111-2222-3333-4444-555555555555",
        email: str = "ada@example.com",
        name: str = "Ada Lovelace",
        picture: str | None = "https://lh3.googleusercontent.com/a/ada",
        groups: tuple[str, ...] = (),
        expires_in: timedelta = timedelta(hours=1),
        kid: str | None = None,
        **overrides: Any,
    ) -> str:
        """An ID token as the pool would issue it after a Google sign-in."""
        now = datetime.now(UTC)
        payload: dict[str, Any] = {
            "sub": sub,
            "email": email,
            "email_verified": True,
            "name": name,
            "picture": picture,
            "iss": self.issuer,
            "aud": self.client_id,
            "token_use": "id",
            "cognito:username": f"google_{sub}",
            "auth_time": int(now.timestamp()),
            "iat": now,
            "exp": now + expires_in,
        }
        if groups:
            payload["cognito:groups"] = list(groups)
        payload.update(overrides)
        return jwt.encode(
            payload,
            self._private_key,
            algorithm="RS256",
            headers={"kid": kid or self.kid},
        )
