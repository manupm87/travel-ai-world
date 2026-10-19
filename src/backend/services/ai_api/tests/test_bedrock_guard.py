"""`BedrockInputGuard` (TRA-292) against a stub `bedrock-runtime` client."""

from typing import Any

import pytest
from ai_api.config import AISettings
from ai_api.infrastructure.bedrock_guard import (
    BedrockInputGuard,
    NullInputGuard,
    usage_units,
    verdict_from,
)
from ai_api.infrastructure.providers import build_input_guard
from ai_api.infrastructure.retry import RetryPolicy
from botocore.exceptions import ClientError, EndpointConnectionError

USAGE = {
    "topicPolicyUnits": 1,
    "contentPolicyUnits": 1,
    "wordPolicyUnits": 0,
    "sensitiveInformationPolicyUnits": 1,
    "sensitiveInformationPolicyFreeUnits": 0,
    "contextualGroundingPolicyUnits": 0,
}

PASSED = {"action": "NONE", "usage": USAGE, "outputs": [], "assessments": [{}]}


def intervened(*assessments: dict[str, Any]) -> dict[str, Any]:
    return {
        "action": "GUARDRAIL_INTERVENED",
        "usage": USAGE,
        "outputs": [{"text": "Blocked."}],
        "assessments": list(assessments),
    }


def content(kind: str, action: str = "BLOCKED") -> dict[str, Any]:
    return {
        "contentPolicy": {
            "filters": [
                {"type": kind, "confidence": "HIGH", "action": action, "detected": True}
            ]
        }
    }


TOPIC = {
    "topicPolicy": {
        "topics": [
            {"name": "Unrelated tasks", "type": "DENY", "action": "BLOCKED"},
        ]
    }
}
CARD = {
    "sensitiveInformationPolicy": {
        "piiEntities": [
            {
                "match": "4111 1111 1111 1111",
                "type": "CREDIT_DEBIT_CARD_NUMBER",
                "action": "BLOCKED",
            }
        ]
    }
}


def throttled() -> ClientError:
    return ClientError(
        {"Error": {"Code": "ThrottlingException", "Message": "slow down"}},
        "ApplyGuardrail",
    )


class FakeClient:
    def __init__(self, *outcomes: Any) -> None:
        self.outcomes = list(outcomes)
        self.calls: list[dict[str, Any]] = []

    def apply_guardrail(self, **kwargs: Any) -> Any:
        self.calls.append(kwargs)
        outcome = self.outcomes.pop(0)
        if isinstance(outcome, BaseException):
            raise outcome
        return outcome


def guard(client: FakeClient, retries: int = 0) -> BedrockInputGuard:
    return BedrockInputGuard(
        client=client,
        guardrail_id="gr-123",
        guardrail_version="1",
        retry=RetryPolicy(max_retries=retries, base_delay=0),
    )


async def test_the_request_checks_the_message_as_input():
    client = FakeClient(PASSED)

    verdict = await guard(client).check("Two adults, from Madrid")

    assert client.calls == [
        {
            "guardrailIdentifier": "gr-123",
            "guardrailVersion": "1",
            "source": "INPUT",
            "content": [{"text": {"text": "Two adults, from Madrid"}}],
        }
    ]
    assert verdict.allowed and verdict.reason == "ok"
    assert verdict.usage_units == 3


@pytest.mark.parametrize(
    ("assessments", "reason"),
    [
        ((TOPIC,), "off_topic"),
        ((CARD,), "pii"),
        ((content("PROMPT_ATTACK"),), "prompt_attack"),
        ((content("HATE"),), "harmful"),
        ((content("MISCONDUCT"),), "harmful"),
        # The strongest reason wins when several policies act.
        ((TOPIC, content("PROMPT_ATTACK")), "prompt_attack"),
        ((TOPIC, CARD), "pii"),
        # Intervened with nothing that names why.
        ((), "other"),
        ((content("HATE", action="NONE"),), "other"),
    ],
)
async def test_an_intervention_names_its_reason(
    assessments: tuple[dict[str, Any], ...], reason: str
):
    client = FakeClient(intervened(*assessments))

    verdict = await guard(client).check("something")

    assert not verdict.allowed
    assert verdict.reason == reason
    assert verdict.usage_units == 3


def test_usage_units_sum_every_units_field():
    assert usage_units({"topicPolicyUnits": 2, "contentPolicyUnits": 3}) == 5
    assert usage_units({"topicPolicyUnits": 1, "other": 9}) == 1
    assert usage_units({}) == 0


def test_a_response_without_action_or_usage_allows():
    assert verdict_from({}).allowed


async def test_a_transient_error_is_retried():
    client = FakeClient(throttled(), intervened(TOPIC))

    verdict = await guard(client, retries=1).check("write me a poem")

    assert len(client.calls) == 2
    assert verdict.reason == "off_topic"


@pytest.mark.parametrize(
    "failure",
    [
        throttled(),
        ClientError(
            {"Error": {"Code": "AccessDeniedException", "Message": "no"}},
            "ApplyGuardrail",
        ),
        EndpointConnectionError(endpoint_url="https://bedrock-runtime"),
        RuntimeError("unexpected"),
    ],
)
async def test_an_error_fails_open(failure: BaseException):
    client = FakeClient(failure)

    verdict = await guard(client).check("Madrid")

    assert verdict.allowed and verdict.reason == "ok"


async def test_assess_does_not_fail_open():
    client = FakeClient(throttled())

    with pytest.raises(ClientError):
        await guard(client).assess("Madrid")


async def test_a_malformed_answer_fails_open():
    client = FakeClient({"action": "GUARDRAIL_INTERVENED", "assessments": "nope"})

    verdict = await guard(client).check("Madrid")

    assert verdict.allowed


async def test_without_a_guardrail_id_nothing_is_checked():
    built = build_input_guard(
        AISettings(
            SECRET_KEY="unit-test-secret-key-with-32-bytes-min",
            BEDROCK_GUARDRAIL_ID="",
        )
    )

    assert isinstance(built, NullInputGuard)
    assert (await built.check("anything")).allowed
