"""Test doubles for the ports. Shipped with the package so any consumer's
tests (and this service's own) can run without a network or an API key."""

from collections.abc import AsyncIterator, Sequence

from ai_api.config import AISettings
from ai_api.domain.models import Message


def settings_for_tests() -> AISettings:
    return AISettings(SECRET_KEY="unit-test-secret-key-with-32-bytes-min")  # noqa: S106


class FakeProvider:
    """Records what it was asked and streams a canned answer."""

    def __init__(self, deltas: Sequence[str] = ("Hola", " mundo")) -> None:
        self.deltas = list(deltas)
        self.calls: list[list[Message]] = []

    async def stream(self, messages: Sequence[Message]) -> AsyncIterator[str]:
        self.calls.append(list(messages))
        for delta in self.deltas:
            yield delta
