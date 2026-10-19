"""InputGuard adapters: an Amazon Bedrock Guardrail, or nothing (TRA-292).

`BedrockInputGuard` calls `ApplyGuardrail` on the traveller's message
(`source="INPUT"`) with the guardrail Terraform defines (`infra/aws/
guardrail.tf`): prompt attacks, harmful content, card numbers and IBANs, and
one denied topic for asks unrelated to travel. It uses the same client
configuration and the same retry policy as the chat provider, and runs the
synchronous boto3 call in a worker thread.

It fails open: whatever goes wrong (credentials, throttling past the retries,
a malformed answer) is logged and the message is allowed. The daily token
quota and the agent's structural rules (known ids only, loop budgets) still
hold; a guard outage must not take the planner down.

`NullInputGuard` allows everything: the local default and the deployed one
until the guardrail is applied (`BEDROCK_GUARDRAIL_ID` empty).
"""

import asyncio
import logging
from collections.abc import Mapping, Sequence
from typing import Any, Protocol, cast

import boto3
from botocore.exceptions import BotoCoreError, ClientError

from ai_api.config import AISettings
from ai_api.domain.models import GuardReason, GuardVerdict
from ai_api.infrastructure.bedrock import client_config, is_retryable
from ai_api.infrastructure.retry import RetryPolicy

logger = logging.getLogger(__name__)

ALLOW = GuardVerdict(allowed=True, reason="ok", usage_units=0)

PROMPT_ATTACK = "PROMPT_ATTACK"

# Strongest first: a message that is both an attack and off-topic is an attack.
_REASON_ORDER: tuple[GuardReason, ...] = (
    "prompt_attack",
    "harmful",
    "pii",
    "off_topic",
    "other",
)


class GuardrailClient(Protocol):
    """The one `bedrock-runtime` operation this adapter uses; tests pass a fake."""

    def apply_guardrail(self, **kwargs: Any) -> Any: ...


class NullInputGuard:
    """Allows every message: no guardrail is configured."""

    async def check(self, text: str) -> GuardVerdict:
        return ALLOW


class BedrockInputGuard:
    def __init__(
        self,
        *,
        client: GuardrailClient,
        guardrail_id: str,
        guardrail_version: str,
        retry: RetryPolicy = RetryPolicy(),
    ) -> None:
        self._client = client
        self._id = guardrail_id
        self._version = guardrail_version
        self._retry = retry

    @classmethod
    def from_settings(cls, settings: AISettings) -> "BedrockInputGuard":
        config = client_config(
            region=settings.BEDROCK_REGION,
            connect_timeout=settings.BEDROCK_CONNECT_TIMEOUT,
            read_timeout=settings.BEDROCK_READ_TIMEOUT,
        )
        client = cast(GuardrailClient, boto3.client("bedrock-runtime", config=config))
        return cls(
            client=client,
            guardrail_id=settings.BEDROCK_GUARDRAIL_ID,
            # An unversioned guardrail answers as its working draft.
            guardrail_version=settings.BEDROCK_GUARDRAIL_VERSION or "DRAFT",
            retry=RetryPolicy(max_retries=settings.BEDROCK_MAX_RETRIES),
        )

    async def check(self, text: str) -> GuardVerdict:
        try:
            return await self.assess(text)
        except Exception as exc:  # fail open, whatever went wrong
            logger.warning("Input guard unavailable, allowing the message: %s", exc)
            return ALLOW

    async def assess(self, text: str) -> GuardVerdict:
        """`check` without failing open: an error propagates (the probe's
        way of telling a clean run from an unreachable guardrail)."""
        request = {
            "guardrailIdentifier": self._id,
            "guardrailVersion": self._version,
            "source": "INPUT",
            "content": [{"text": {"text": text}}],
        }
        return verdict_from(await self._apply(request))

    async def _apply(self, request: dict[str, Any]) -> Mapping[str, Any]:
        for delay in self._retry.delays():
            try:
                return await asyncio.to_thread(self._client.apply_guardrail, **request)
            except (ClientError, BotoCoreError) as exc:
                if delay is None or not is_retryable(exc):
                    raise
                logger.warning("Guardrail error (%s); retrying in %.0fs", exc, delay)
                await asyncio.sleep(delay)
        raise RuntimeError("no attempt was made")  # pragma: no cover


def verdict_from(response: Mapping[str, Any]) -> GuardVerdict:
    """`ApplyGuardrail`'s answer as a verdict: allowed unless the guardrail
    intervened, the reason read from the assessments that stopped it."""
    units = usage_units(response.get("usage") or {})
    if response.get("action") != "GUARDRAIL_INTERVENED":
        return GuardVerdict(allowed=True, reason="ok", usage_units=units)
    found = _reasons(response.get("assessments") or [])
    for reason in _REASON_ORDER:
        if reason in found:
            return GuardVerdict(allowed=False, reason=reason, usage_units=units)
    return GuardVerdict(allowed=False, reason="other", usage_units=units)


def usage_units(usage: Mapping[str, Any]) -> int:
    """The sum of the response's `usage.*Units` fields (what the call is billed)."""
    return sum(
        int(value)
        for key, value in usage.items()
        if key.endswith("Units") and isinstance(value, int | float)
    )


def _reasons(assessments: Sequence[Mapping[str, Any]]) -> set[GuardReason]:
    found: set[GuardReason] = set()
    for assessment in assessments:
        for item in _acted(assessment, "contentPolicy", "filters"):
            found.add(
                "prompt_attack" if item.get("type") == PROMPT_ATTACK else "harmful"
            )
        if _acted(assessment, "topicPolicy", "topics"):
            found.add("off_topic")
        sensitive = [
            *_acted(assessment, "sensitiveInformationPolicy", "piiEntities"),
            *_acted(assessment, "sensitiveInformationPolicy", "regexes"),
        ]
        if sensitive:
            found.add("pii")
        if _acted(assessment, "wordPolicy", "customWords") or _acted(
            assessment, "wordPolicy", "managedWordLists"
        ):
            found.add("other")
    return found


def _acted(
    assessment: Mapping[str, Any], policy: str, key: str
) -> list[Mapping[str, Any]]:
    """The entries of one policy that the guardrail acted on."""
    entries = (assessment.get(policy) or {}).get(key) or []
    return [
        e
        for e in entries
        if isinstance(e, Mapping) and e.get("action", "BLOCKED") != "NONE"
    ]
