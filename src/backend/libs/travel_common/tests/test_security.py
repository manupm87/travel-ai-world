"""Local-mode tokens round-trip the whole Principal, so stateless services can trust them."""

import jwt
import pytest
from pydantic import ValidationError
from travel_common.config import CommonSettings
from travel_common.exceptions import Unauthorized
from travel_common.principal import Principal, Role
from travel_common.security import (
    create_access_token,
    decode_access_token,
    principal_from_token,
    verify_token,
)

settings = CommonSettings(SECRET_KEY="unit-test-secret-key-with-32-bytes-min")


def test_token_round_trips_principal():
    principal = Principal(subject="42", email="ada@example.com", role=Role.ADMIN)

    assert (
        principal_from_token(create_access_token(principal, settings), settings)
        == principal
    )


def test_local_claims_carry_no_profile():
    principal = Principal(subject="42", email="ada@example.com")

    claims = verify_token(create_access_token(principal, settings), settings)

    assert (claims.name, claims.picture) == ("", None)
    assert claims.principal == principal


def test_token_without_role_claim_is_rejected():
    token = jwt.encode(
        {"sub": "1", "exp": 4_102_444_800}, settings.SECRET_KEY, settings.ALGORITHM
    )

    with pytest.raises(Unauthorized):
        principal_from_token(token, settings)


@pytest.mark.parametrize("missing", ["exp", "sub"], ids=["no-expiry", "no-subject"])
def test_token_without_a_required_claim_is_rejected(missing: str):
    claims: dict[str, object] = {
        "sub": "1",
        "email": "ada@example.com",
        "role": "user",
        "exp": 4_102_444_800,
    }
    del claims[missing]
    token = jwt.encode(claims, settings.SECRET_KEY, settings.ALGORITHM)

    # decode_access_token directly: _claims_from_local would also reject a missing
    # `sub`, so going through principal_from_token would not test the `require` list
    with pytest.raises(Unauthorized):
        decode_access_token(token, settings)


def test_a_non_hmac_algorithm_is_refused_at_start():
    with pytest.raises(ValidationError):
        CommonSettings.model_validate({"SECRET_KEY": "x", "ALGORITHM": "none"})


def test_garbage_token_is_rejected():
    with pytest.raises(Unauthorized):
        principal_from_token("not-a-jwt", settings)


def test_empty_secret_key_is_a_401_not_a_500():
    unconfigured = CommonSettings(SECRET_KEY="")
    principal = Principal(subject="1", email="ada@example.com", role=Role.USER)
    token = create_access_token(principal, settings)

    with pytest.raises(Unauthorized):
        principal_from_token(token, unconfigured)
