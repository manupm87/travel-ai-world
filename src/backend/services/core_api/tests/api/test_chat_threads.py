"""Conversations are private, and their messages are an append-only log."""

from typing import Any
from uuid import UUID

from core_api.domain.models import User
from core_api.infrastructure.dynamo.repositories import DynamoChatMessageRepository
from core_api.infrastructure.dynamo.table import DynamoTable
from core_api.pagination import Page
from httpx import AsyncClient

from tests.conftest import headers_for

THREADS_URL = "/api/v1/chat-threads/"
MISSING = "00000000-0000-0000-0000-000000000000"

QUESTION = {"role": "user", "content": "¿Dónde tomar algo en Kreuzberg?"}
ANSWER: dict[str, Any] = {
    "role": "assistant",
    "content": "Prueba Club der Visionäre, junto al canal [wv:en:Berlin/Kreuzberg#drink:cdv].",
    "sources": [{"doc_id": "wv:en:Berlin/Kreuzberg#drink:cdv", "score": 0.21}],
    "model": "eu.anthropic.claude-haiku-4-5-20251001-v1:0",
    "input_tokens": 812,
    "output_tokens": 96,
    "latency_ms": 2140,
}


def messages_url(thread_id: str) -> str:
    return f"{THREADS_URL}{thread_id}/messages/"


async def start_thread(client: AsyncClient, user: User, **body: Any) -> str:
    response = await client.post(THREADS_URL, json=body, headers=headers_for(user))
    assert response.status_code == 201, response.text
    return response.json()["id"]


async def test_create_and_list_only_own_threads(
    client: AsyncClient, alice: User, bob: User
):
    created = await client.post(
        THREADS_URL,
        json={"title": "Fin de semana", "city": " Berlin "},
        headers=headers_for(alice),
    )
    assert created.status_code == 201
    assert created.json()["user_id"] == str(alice.id)
    assert created.json()["city"] == "berlin", "the city is stored as a slug"

    alice_threads = await client.get(THREADS_URL, headers=headers_for(alice))
    bob_threads = await client.get(THREADS_URL, headers=headers_for(bob))

    assert [t["title"] for t in alice_threads.json()] == ["Fin de semana"]
    assert bob_threads.json() == []


async def test_a_new_message_moves_its_thread_to_the_top(
    client: AsyncClient, alice: User
):
    headers = headers_for(alice)
    first = await start_thread(client, alice, title="first")
    await start_thread(client, alice, title="second")

    before = await client.get(THREADS_URL, headers=headers)
    assert [t["title"] for t in before.json()] == ["second", "first"]

    await client.post(messages_url(first), json=QUESTION, headers=headers)

    after = await client.get(THREADS_URL, headers=headers)
    assert [t["title"] for t in after.json()] == ["first", "second"]


async def test_messages_keep_their_order_and_the_answer_metadata(
    client: AsyncClient, alice: User
):
    headers = headers_for(alice)
    thread_id = await start_thread(client, alice, city="berlin")

    for body in (QUESTION, ANSWER):
        response = await client.post(
            messages_url(thread_id), json=body, headers=headers
        )
        assert response.status_code == 201, response.text

    listed = (await client.get(messages_url(thread_id), headers=headers)).json()

    assert [m["role"] for m in listed] == ["user", "assistant"]
    question, answer = listed
    assert question["sources"] is None and question["model"] is None
    assert answer["thread_id"] == thread_id
    assert answer["sources"] == [
        {
            "doc_id": "wv:en:Berlin/Kreuzberg#drink:cdv",
            "score": 0.21,
            "title": None,
            "url": None,
        }
    ]
    assert (answer["model"], answer["input_tokens"], answer["output_tokens"]) == (
        ANSWER["model"],
        812,
        96,
    )
    assert answer["latency_ms"] == 2140

    page = await client.get(
        messages_url(thread_id), params={"skip": 1, "limit": 1}, headers=headers
    )
    assert [m["role"] for m in page.json()] == ["assistant"]


async def test_a_user_turn_carries_no_model_or_usage(client: AsyncClient, alice: User):
    thread_id = await start_thread(client, alice)

    response = await client.post(
        messages_url(thread_id),
        json={**QUESTION, "model": "eu.amazon.nova-lite-v1:0", "input_tokens": 10},
        headers=headers_for(alice),
    )

    assert response.status_code == 422
    assert response.json()["detail"]["error_code"] == "UNPROCESSABLE_ENTITY"


async def test_invalid_input_is_rejected(client: AsyncClient, alice: User):
    headers = headers_for(alice)
    thread_id = await start_thread(client, alice)

    bad_messages = [
        {"role": "system", "content": "no system turns"},
        {"role": "user", "content": ""},
        {**ANSWER, "input_tokens": -1},
    ]
    for body in bad_messages:
        response = await client.post(
            messages_url(thread_id), json=body, headers=headers
        )
        assert response.status_code == 422, body

    bad_city = await client.post(
        THREADS_URL, json={"city": "Berlin 2026"}, headers=headers
    )
    assert bad_city.status_code == 422


async def test_other_users_thread_is_not_found(
    client: AsyncClient, alice: User, bob: User
):
    thread_id = await start_thread(client, alice, title="privado")
    await client.post(
        messages_url(thread_id), json=QUESTION, headers=headers_for(alice)
    )
    bob_headers = headers_for(bob)

    responses = [
        await client.get(f"{THREADS_URL}{thread_id}", headers=bob_headers),
        await client.get(messages_url(thread_id), headers=bob_headers),
        await client.post(messages_url(thread_id), json=QUESTION, headers=bob_headers),
        await client.delete(f"{THREADS_URL}{thread_id}", headers=bob_headers),
    ]

    # Threads are keyed by their owner (ADR 0023): for bob this one is not there.
    assert [r.status_code for r in responses] == [404, 404, 404, 404]


async def test_missing_thread_is_not_found(client: AsyncClient, alice: User):
    response = await client.get(f"{THREADS_URL}{MISSING}", headers=headers_for(alice))

    assert response.status_code == 404
    assert response.json()["detail"]["message"] == "Chat thread not found"


async def test_rename_then_delete_takes_the_messages_with_it(
    client: AsyncClient, alice: User, table: DynamoTable
):
    headers = headers_for(alice)
    thread_id = await start_thread(client, alice, title="Berlín", city="berlin")
    for body in (QUESTION, ANSWER):
        await client.post(messages_url(thread_id), json=body, headers=headers)

    renamed = await client.patch(
        f"{THREADS_URL}{thread_id}", json={"title": "Berlín en marzo"}, headers=headers
    )
    assert renamed.status_code == 200
    assert renamed.json()["title"] == "Berlín en marzo"
    assert renamed.json()["city"] == "berlin", "PATCH is partial"

    deleted = await client.delete(f"{THREADS_URL}{thread_id}", headers=headers)
    assert deleted.status_code == 204
    assert (
        await client.get(f"{THREADS_URL}{thread_id}", headers=headers)
    ).status_code == 404
    remaining = await DynamoChatMessageRepository(table).list_in(
        UUID(thread_id), Page()
    )
    assert remaining == []


async def test_threads_require_a_token(client: AsyncClient):
    response = await client.get(THREADS_URL)

    assert response.status_code == 401
