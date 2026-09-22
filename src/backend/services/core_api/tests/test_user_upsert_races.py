"""A first sign-in fires several requests at once: every one of them gets the account."""

import pytest
from core_api.auth.google import ExternalIdentity
from core_api.domain.models import User
from core_api.infrastructure.dynamo.repositories import DynamoUserRepository
from core_api.infrastructure.dynamo.table import DynamoTable
from core_api.services.user_service import UserService

IDENTITY = ExternalIdentity(
    subject="sub-1",
    email="ada@example.com",
    name="Ada",
    picture=None,
    provider="cognito",
)


class _LateReader(DynamoUserRepository):
    """Reads nothing the first time, as if a parallel request had not written yet."""

    def __init__(self, table: DynamoTable) -> None:
        super().__init__(table)
        self.misses = 1

    async def get_by_email(self, email: str) -> User | None:
        if self.misses:
            self.misses -= 1
            return None
        return await super().get_by_email(email)


@pytest.fixture
def repository(table: DynamoTable) -> _LateReader:
    return _LateReader(table)


async def test_an_account_created_meanwhile_is_adopted(repository: _LateReader):
    first = await UserService(
        DynamoUserRepository(repository.table)
    ).upsert_from_identity(IDENTITY)

    second = await UserService(repository).upsert_from_identity(IDENTITY)

    assert second.id == first.id


async def test_a_profile_refreshed_meanwhile_is_reread(table: DynamoTable):
    users = DynamoUserRepository(table)
    created = await UserService(users).upsert_from_identity(IDENTITY)
    stale = await users.get(created.id)
    assert stale is not None
    # Another request refreshes the profile first: `stale` now has an old version.
    moved = await users.get(created.id)
    assert moved is not None
    moved.picture = "https://example.com/ada.png"
    await users.save(moved)

    class _Stale(DynamoUserRepository):
        served = False

        async def get_by_email(self, email: str) -> User | None:
            if not self.served:
                self.served = True
                return stale
            return await super().get_by_email(email)

    renamed = await UserService(_Stale(table)).upsert_from_identity(
        ExternalIdentity(
            subject="sub-1",
            email="ada@example.com",
            name="Ada Lovelace",
            provider="cognito",
        )
    )

    assert renamed.name == "Ada Lovelace"
    stored = await users.get(created.id)
    assert stored is not None
    assert stored.name == "Ada Lovelace"
