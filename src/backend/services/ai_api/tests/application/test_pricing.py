"""`application.pricing`: known models are priced, unknown ones are not guessed."""

import pytest
from ai_api.application.pricing import PRICING_VERSION, estimate, price_of


def test_a_bedrock_profile_is_priced_by_its_base_model():
    cost = estimate(
        "eu.anthropic.claude-haiku-4-5-20251001-v1:0",
        2_000,
        500,
        "amazon.titan-embed-text-v2:0",
        1_000,
    )

    assert cost == pytest.approx((2_000 * 1.0 + 500 * 5.0 + 1_000 * 0.02) / 1e6)


def test_a_model_without_a_public_price_costs_none():
    assert estimate("nvidia/nemotron-3-super-120b-a12b", 1_000, 100, None, 0) is None
    assert estimate(None, 1_000, 100, None, 0) is None


def test_embeddings_of_an_unknown_model_add_nothing():
    cost = estimate("anthropic.claude-haiku-4-5", 1_000_000, 0, "other", 50)

    assert cost == pytest.approx(1.0)


def test_the_table_is_versioned():
    assert PRICING_VERSION
    assert price_of("amazon.titan-embed-text-v2:0") == (0.02, 0.0)
