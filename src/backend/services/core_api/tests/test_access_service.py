"""`AccessService` (ADR 0026): the rules, and the grants over moto."""

import uuid
from datetime import UTC, datetime
from typing import Literal

import pytest
from core_api.auth.principal import AccountPrincipal
from core_api.config import CoreSettings, get_settings
from core_api.domain.models import AccessGrant, User
from core_api.infrastructure.dynamo.repositories import (
    DynamoAccessGrantRepository,
    DynamoUserRepository,
)
from core_api.infrastructure.dynamo.table import DynamoTable
from core_api.services.access_service import Access, AccessService
from pydantic import ValidationError
from travel_common.dynamodb import from_item
from travel_common.exceptions import AccessDenied, BadRequest, EntityNotFound
from travel_common.principal import Role

EMAIL = "traveller@example.com"
Mode = Literal["open", "allowlist"]


@pytest.fixture
def grants(table: DynamoTable) -> DynamoAccessGrantRepository:
    return DynamoAccessGrantRepository(table)


def principal(role: Role = Role.USER, email: str = EMAIL) -> AccountPrincipal:
    account = uuid.uuid4()
    return AccountPrincipal(subject=str(account), email=email, role=role, id=account)


def service(
    grants: DynamoAccessGrantRepository, mode: Mode = "allowlist", default: int = 300
) -> AccessService:
    settings = get_settings().model_copy(
        update={"ACCESS_MODE": mode, "DEFAULT_DAILY_TOKEN_LIMIT": default}
    )
    return AccessService(grants, settings)


# ── resolve ──────────────────────────────────────────────────────────────────

NO_GRANT = "no grant"


@pytest.mark.parametrize(
    ("mode", "role", "grant_limit", "default", "expected"),
    [
        # open mode: everyone is allowed; the limit still follows the grant
        ("open", Role.USER, NO_GRANT, 300, Access(True, 300)),
        ("open", Role.USER, None, 300, Access(True, 300)),
        ("open", Role.USER, 50, 300, Access(True, 50)),
        ("open", Role.USER, 0, 300, Access(True, None)),
        ("open", Role.USER, NO_GRANT, 0, Access(True, None)),
        ("open", Role.ADMIN, NO_GRANT, 300, Access(True, 300)),
        # allowlist: a grant or the admin role
        ("allowlist", Role.USER, NO_GRANT, 300, Access(False, 300)),
        ("allowlist", Role.USER, NO_GRANT, 0, Access(False, None)),
        ("allowlist", Role.USER, None, 300, Access(True, 300)),
        ("allowlist", Role.USER, None, 0, Access(True, None)),
        ("allowlist", Role.USER, 50, 300, Access(True, 50)),
        ("allowlist", Role.USER, 50, 0, Access(True, 50)),
        ("allowlist", Role.USER, 0, 300, Access(True, None)),
        ("allowlist", Role.ADMIN, NO_GRANT, 300, Access(True, 300)),
        ("allowlist", Role.ADMIN, 50, 300, Access(True, 50)),
        ("allowlist", Role.ADMIN, 0, 300, Access(True, None)),
    ],
)
async def test_resolve(
    grants: DynamoAccessGrantRepository,
    mode: Mode,
    role: Role,
    grant_limit: int | str | None,
    default: int,
    expected: Access,
):
    if grant_limit != NO_GRANT:
        assert not isinstance(grant_limit, str)
        await grants.put(
            AccessGrant(email=EMAIL, daily_token_limit=grant_limit, added_by="t")
        )

    access = await service(grants, mode, default).resolve(principal(role))

    assert access == expected


async def test_the_email_matches_whatever_its_case(
    grants: DynamoAccessGrantRepository,
):
    await grants.put(AccessGrant(email="  Mixed@Example.COM ", added_by="t"))
    access = service(grants)

    resolved = await access.resolve(principal(email="mixed@example.com"))
    await access.ensure_allowed(principal(email="MIXED@example.com"))

    assert resolved.allowed is True


async def test_ensure_allowed_raises_only_for_the_uninvited(
    grants: DynamoAccessGrantRepository,
):
    with pytest.raises(AccessDenied) as refused:
        await service(grants).ensure_allowed(principal())
    assert refused.value.error_code == "ACCESS_DENIED"

    await service(grants).ensure_allowed(principal(Role.ADMIN))
    await service(grants, "open").ensure_allowed(principal())
    await grants.put(AccessGrant(email=EMAIL, added_by="t"))
    await service(grants).ensure_allowed(principal())


async def test_upsert_and_remove(grants: DynamoAccessGrantRepository):
    access = service(grants)
    first_admin = principal(Role.ADMIN, "one@example.com")
    second_admin = principal(Role.ADMIN, "two@example.com")

    created = await access.upsert(" New@Example.com", 10, "  friend ", first_admin)
    changed = await access.upsert("new@example.com", None, "", second_admin)
    listed, cursor = await access.list_page(None, 10)

    assert (created.email, created.daily_token_limit, created.note) == (
        "new@example.com",
        10,
        "friend",
    )
    assert changed.added_by == first_admin.subject
    assert changed.created_at == created.created_at
    assert changed.updated_at >= created.updated_at
    assert (changed.daily_token_limit, changed.note) == (None, None)
    assert [g.email for g in listed] == ["new@example.com"]
    assert cursor is None

    await access.remove("NEW@example.com")
    with pytest.raises(EntityNotFound):
        await access.remove("new@example.com")


# ── settings ─────────────────────────────────────────────────────────────────


def test_the_defaults_are_open_and_three_hundred_thousand():
    fields = CoreSettings.model_fields

    assert fields["ACCESS_MODE"].default == "open"
    assert fields["DEFAULT_DAILY_TOKEN_LIMIT"].default == 300_000


@pytest.mark.parametrize(
    "bad", [{"ACCESS_MODE": "closed"}, {"DEFAULT_DAILY_TOKEN_LIMIT": -1}]
)
def test_settings_refuse_an_unknown_mode_or_a_negative_limit(bad: dict[str, object]):
    with pytest.raises(ValidationError):
        CoreSettings(SECRET_KEY="x", **bad)  # type: ignore[arg-type]


# ── the repository over moto ─────────────────────────────────────────────────


async def test_a_grant_round_trips_with_its_keys(
    table: DynamoTable, grants: DynamoAccessGrantRepository
):
    moment = datetime(2026, 10, 1, 12, 0, tzinfo=UTC)
    await grants.put(
        AccessGrant(
            email="Ada@Example.com",
            daily_token_limit=0,
            note="unlimited",
            added_by="admin-sub",
            created_at=moment,
            updated_at=moment,
        )
    )

    stored = await grants.get("ADA@example.com")
    (item,) = [from_item(i) for i in table.client.scan(TableName=table.name)["Items"]]

    assert stored == AccessGrant(
        email="ada@example.com",
        daily_token_limit=0,
        note="unlimited",
        added_by="admin-sub",
        created_at=moment,
        updated_at=moment,
    )
    assert (item["PK"], item["SK"]) == ("ACCESS#ada@example.com", "ACCESS")
    assert (item["GSI1PK"], item["GSI1SK"]) == ("ACCESS", "ada@example.com")
    assert await grants.get("nobody@example.com") is None


async def test_put_again_keeps_who_added_it_and_when(
    grants: DynamoAccessGrantRepository,
):
    first = await grants.put(
        AccessGrant(email="a@example.com", daily_token_limit=5, added_by="first")
    )
    second = await grants.put(
        AccessGrant(email="A@example.com", note="changed", added_by="second")
    )
    stored = await grants.get("a@example.com")

    assert stored == second
    assert stored is not None
    assert stored.added_by == "first"
    assert stored.created_at == first.created_at
    assert stored.updated_at >= first.updated_at
    assert (stored.daily_token_limit, stored.note) == (None, "changed")
    assert len((await grants.list_page(None, 10))[0]) == 1


async def test_grants_page_by_email_and_delete_is_idempotent(
    grants: DynamoAccessGrantRepository,
):
    for email in ("d@example.com", "b@example.com", "a@example.com", "c@example.com"):
        await grants.put(AccessGrant(email=email, added_by="t"))

    first, cursor = await grants.list_page(None, 3)
    rest, end = await grants.list_page(cursor, 3)

    assert [g.email for g in first] == [
        "a@example.com",
        "b@example.com",
        "c@example.com",
    ]
    assert cursor is not None
    assert [g.email for g in rest] == ["d@example.com"]
    assert end is None

    assert await grants.delete("B@example.com") is True
    assert await grants.delete("b@example.com") is False
    assert await grants.get("b@example.com") is None
    with pytest.raises(BadRequest):
        await grants.list_page("not-a-cursor", 3)


async def test_grants_and_accounts_do_not_show_up_in_each_others_list(
    table: DynamoTable, grants: DynamoAccessGrantRepository
):
    users = DynamoUserRepository(table)
    await users.add(User(email="account@example.com"))
    await grants.put(AccessGrant(email="invited@example.com", added_by="t"))
    await grants.put(AccessGrant(email="account@example.com", added_by="t"))

    accounts, _ = await users.list_page(None, 10)
    invited, _ = await grants.list_page(None, 10)

    assert [u.email for u in accounts] == ["account@example.com"]
    assert [g.email for g in invited] == ["account@example.com", "invited@example.com"]
    assert (await users.get_by_email("account@example.com")) is not None
