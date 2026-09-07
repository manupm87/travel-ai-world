"""The use case only composes messages; providers and retrievers are ports."""

from ai_api.application.stream_chat import StreamChat
from ai_api.domain.models import Document, Message
from ai_api.testing import FakeProvider


async def _collect(stream) -> list[str]:
    return [delta async for delta in stream]


async def test_prepends_system_prompt_and_appends_user_turn():
    provider = FakeProvider(["ok"])
    use_case = StreamChat(provider, system_prompt="be helpful")

    deltas = await _collect(use_case("hola", [Message("assistant", "previo")]))

    assert deltas == ["ok"]
    assert provider.calls[0] == [
        Message("system", "be helpful"),
        Message("assistant", "previo"),
        Message("user", "hola"),
    ]


async def test_retrieved_documents_become_a_second_system_message():
    class StaticRetriever:
        async def search(self, query: str, *, limit: int = 5) -> list[Document]:
            return [Document("1", "Madrid has great tapas")]

    provider = FakeProvider(["ok"])
    use_case = StreamChat(provider, "sys", retriever=StaticRetriever())

    await _collect(use_case("tapas?"))

    system_messages = [m for m in provider.calls[0] if m.role == "system"]
    assert len(system_messages) == 2
    assert system_messages[1].content == (
        "Use this background information:\nMadrid has great tapas"
    )
