"""Cognito mode: RS256 ID tokens verified offline against the pool's JWKS."""

from datetime import timedelta

import pytest
from travel_common.config import CommonSettings
from travel_common.exceptions import Unauthorized
from travel_common.principal import Principal, Role
from travel_common.security import (
    create_access_token,
    principal_from_token,
    verify_token,
)
from travel_common.testing import CognitoTestIssuer

pool = CognitoTestIssuer()
settings = CommonSettings(**pool.settings_overrides())


def test_pool_token_becomes_claims_and_principal():
    token = pool.id_token(sub="sub-1", email="ada@example.com", groups=("admin",))

    claims = verify_token(token, settings)

    assert claims.subject == "sub-1"
    assert claims.email == "ada@example.com"
    assert claims.role is Role.ADMIN
    assert claims.name == "Ada Lovelace"
    assert claims.picture == "https://lh3.googleusercontent.com/a/ada"
    assert principal_from_token(token, settings) == Principal(
        subject="sub-1", email="ada@example.com", role=Role.ADMIN
    )


def test_no_group_means_plain_user():
    assert verify_token(pool.id_token(), settings).role is Role.USER
    other = pool.id_token(groups=("editors",))
    assert verify_token(other, settings).role is Role.USER


def test_tampered_payload_is_rejected():
    header, _payload, signature = pool.id_token(email="ada@example.com").split(".")
    forged_payload = pool.id_token(email="mallory@example.com").split(".")[1]

    with pytest.raises(Unauthorized):
        verify_token(f"{header}.{forged_payload}.{signature}", settings)


def test_token_from_another_key_pair_is_rejected():
    impostor = CognitoTestIssuer(kid=pool.kid)  # same kid, different private key

    with pytest.raises(Unauthorized):
        verify_token(impostor.id_token(), settings)


@pytest.mark.parametrize(
    "token",
    [
        pytest.param(pool.id_token(expires_in=timedelta(minutes=-5)), id="expired"),
        pytest.param(pool.id_token(aud="another-client"), id="audience"),
        pytest.param(pool.id_token(iss="https://evil.example"), id="issuer"),
        pytest.param(pool.id_token(token_use="access"), id="access-token"),
        pytest.param(pool.id_token(kid="unknown-kid"), id="unknown-kid"),
        pytest.param(pool.id_token(email=None), id="no-email"),
        pytest.param("not-a-jwt", id="garbage"),
    ],
)
def test_unusable_tokens_are_unauthorized(token: str):
    with pytest.raises(Unauthorized):
        verify_token(token, settings)


def test_local_token_is_not_accepted_in_cognito_mode():
    local = CommonSettings(SECRET_KEY="unit-test-secret-key-with-32-bytes-min")
    token = create_access_token(Principal(subject="1", email="a@b.c"), local)

    with pytest.raises(Unauthorized):
        verify_token(token, settings)


def test_pool_token_is_not_accepted_in_local_mode():
    local = CommonSettings(SECRET_KEY="unit-test-secret-key-with-32-bytes-min")

    with pytest.raises(Unauthorized):
        verify_token(pool.id_token(), local)


def test_incomplete_configuration_is_a_401_not_a_500():
    half_configured = CommonSettings(AUTH_MODE="cognito", COGNITO_JWKS="")

    with pytest.raises(Unauthorized):
        verify_token(pool.id_token(), half_configured)


def test_unparsable_jwks_is_a_401_not_a_500():
    broken = CommonSettings(**{**pool.settings_overrides(), "COGNITO_JWKS": "{nope"})

    with pytest.raises(Unauthorized):
        verify_token(pool.id_token(), broken)
