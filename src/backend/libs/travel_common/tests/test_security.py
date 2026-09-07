"""Tokens round-trip the whole Principal, so stateless services can trust them."""

import jwt
import pytest
from travel_common.config import CommonSettings
from travel_common.exceptions import Unauthorized
from travel_common.principal import Principal, Role
from travel_common.security import create_access_token, principal_from_token

settings = CommonSettings(SECRET_KEY="unit-test-secret-key-with-32-bytes-min")


def test_token_round_trips_principal():
    principal = Principal(id=42, email="ada@example.com", role=Role.ADMIN)

    assert (
        principal_from_token(create_access_token(principal, settings), settings)
        == principal
    )


def test_token_without_role_claim_is_rejected():
    token = jwt.encode(
        {"sub": "1", "exp": 4_102_444_800}, settings.SECRET_KEY, settings.ALGORITHM
    )

    with pytest.raises(Unauthorized):
        principal_from_token(token, settings)


def test_garbage_token_is_rejected():
    with pytest.raises(Unauthorized):
        principal_from_token("not-a-jwt", settings)


def test_empty_secret_key_is_a_401_not_a_500():
    unconfigured = CommonSettings(SECRET_KEY="")
    principal = Principal(id=1, email="ada@example.com", role=Role.USER)
    token = create_access_token(principal, settings)

    with pytest.raises(Unauthorized):
        principal_from_token(token, unconfigured)
