"""`application.access.CheckAccess`: the access list and the daily limit."""

from datetime import date

import pytest
from ai_api.application.access import MAX_CACHED, CheckAccess
from ai_api.domain.usage import Entitlement
from ai_api.testing import FakeAccessGateway, InMemoryUsageStore
from travel_common.exceptions import AccessDenied, DailyTokenLimit, ProviderUnavailable
from travel_common.principal import Principal, Role

TODAY = date(2026, 10, 1)


def someone(subject: str = "sub-1") -> Principal:
    return Principal(subject=subject, email=f"{subject}@example.com", role=Role.USER)


def limited(limit: int | None) -> Entitlement:
    return Entitlement(allowed=True, daily_token_limit=limit)


class Clock:
    def __init__(self) -> None:
        self.now = 1000.0

    def __call__(self) -> float:
        return self.now


async def spend(usage: InMemoryUsageStore, tokens: int, day: date = TODAY) -> None:
    await usage.add(
        "sub-1", day, input_tokens=tokens, output_tokens=0, embed_tokens=999
    )


def check(
    gateway: FakeAccessGateway,
    usage: InMemoryUsageStore | None = None,
    *,
    clock: Clock | None = None,
    today: date = TODAY,
    ttl: float = 60,
) -> CheckAccess:
    return CheckAccess(
        gateway,
        usage or InMemoryUsageStore(),
        ttl_seconds=ttl,
        clock=clock or Clock(),
        today=lambda: today,
    )


async def test_an_allowed_account_gets_its_entitlement():
    gateway = FakeAccessGateway(limited(300_000))

    entitlement = await check(gateway).allowed(someone(), "tok")

    assert entitlement == limited(300_000)
    assert gateway.tokens == ["tok"]


async def test_an_account_off_the_list_is_denied():
    gateway = FakeAccessGateway(Entitlement(allowed=False, daily_token_limit=None))
    access = check(gateway)

    with pytest.raises(AccessDenied):
        await access.allowed(someone(), "tok")
    with pytest.raises(AccessDenied):
        await access.budget(someone(), "tok")


async def test_no_limit_skips_the_counter():
    usage = InMemoryUsageStore(fail_with=RuntimeError("never read"))

    entitlement = await check(FakeAccessGateway(limited(None)), usage).budget(
        someone(), "tok"
    )

    assert entitlement.daily_token_limit is None


async def test_under_the_limit_the_turn_runs():
    usage = InMemoryUsageStore()
    await spend(usage, 999)

    entitlement = await check(FakeAccessGateway(limited(1000)), usage).budget(
        someone(), "tok"
    )

    assert entitlement == limited(1000)


@pytest.mark.parametrize("used", [1000, 1500])
async def test_at_or_over_the_limit_is_refused_with_the_numbers(used: int):
    usage = InMemoryUsageStore()
    await spend(usage, used)

    with pytest.raises(DailyTokenLimit) as raised:
        await check(FakeAccessGateway(limited(1000)), usage).budget(someone(), "tok")

    assert raised.value.error_code == "DAILY_TOKEN_LIMIT"
    assert raised.value.extras == {
        "limit": 1000,
        "used": used,  # input + output: the embedding tokens are not counted
        "resets_at": "2026-10-02T00:00:00+00:00",
    }


async def test_yesterdays_tokens_do_not_count_today():
    usage = InMemoryUsageStore()
    await spend(usage, 5000, day=date(2026, 9, 30))
    gateway = FakeAccessGateway(limited(1000))

    with pytest.raises(DailyTokenLimit) as raised:
        await check(gateway, usage, today=date(2026, 9, 30)).budget(someone(), "tok")
    assert raised.value.extras["resets_at"] == "2026-10-01T00:00:00+00:00"

    # The next UTC day starts from nothing.
    assert await check(gateway, usage, today=TODAY).budget(someone(), "tok")


async def test_a_counter_that_cannot_be_read_lets_the_turn_run():
    usage = InMemoryUsageStore(fail_with=ProviderUnavailable("dynamo down"))

    entitlement = await check(FakeAccessGateway(limited(1000)), usage).budget(
        someone(), "tok"
    )

    assert entitlement == limited(1000)


async def test_core_api_out_of_reach_refuses_the_turn():
    gateway = FakeAccessGateway(fail_with=ProviderUnavailable("core_api unreachable"))

    with pytest.raises(ProviderUnavailable):
        await check(gateway).budget(someone(), "tok")


async def test_the_answer_is_kept_for_the_ttl_then_asked_again():
    clock = Clock()
    gateway = FakeAccessGateway(limited(1000))
    access = check(gateway, clock=clock)

    await access.allowed(someone(), "tok")
    clock.now += 59
    await access.budget(someone(), "tok")
    assert len(gateway.tokens) == 1

    clock.now += 1
    gateway.entitlement = limited(5)
    assert await access.allowed(someone(), "tok") == limited(5)
    assert len(gateway.tokens) == 2


async def test_the_cache_is_keyed_by_subject():
    gateway = FakeAccessGateway(
        by_token={
            "tok-1": limited(1000),
            "tok-2": Entitlement(allowed=False, daily_token_limit=None),
        }
    )
    access = check(gateway)

    assert await access.allowed(someone("sub-1"), "tok-1") == limited(1000)
    with pytest.raises(AccessDenied):
        await access.allowed(someone("sub-2"), "tok-2")
    # A new token of the same person is answered from the cache.
    assert await access.allowed(someone("sub-1"), "tok-1-renewed") == limited(1000)
    assert gateway.tokens == ["tok-1", "tok-2"]


async def test_a_refusal_is_not_kept_so_an_invitation_works_at_once():
    gateway = FakeAccessGateway(Entitlement(allowed=False, daily_token_limit=None))
    access = check(gateway)

    with pytest.raises(AccessDenied):
        await access.allowed(someone(), "tok")
    gateway.entitlement = limited(None)

    assert await access.allowed(someone(), "tok") == limited(None)


async def test_a_ttl_of_zero_asks_every_time():
    gateway = FakeAccessGateway()
    access = check(gateway, ttl=0)

    await access.allowed(someone(), "tok")
    await access.allowed(someone(), "tok")

    assert len(gateway.tokens) == 2


async def test_the_cache_drops_its_oldest_entry_when_full():
    gateway = FakeAccessGateway()
    access = check(gateway)

    for n in range(MAX_CACHED + 1):
        await access.allowed(someone(f"sub-{n}"), "tok")
    await access.allowed(someone(f"sub-{MAX_CACHED}"), "tok")  # kept
    assert len(gateway.tokens) == MAX_CACHED + 1

    await access.allowed(someone("sub-0"), "tok")  # dropped: asked again
    assert len(gateway.tokens) == MAX_CACHED + 2
