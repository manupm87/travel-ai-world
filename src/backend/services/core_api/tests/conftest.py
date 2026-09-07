"""Fixtures: a throwaway PostgreSQL database, an app client and two users.

Tests run against real PostgreSQL (the migrations use Postgres types). The
database `<DB_NAME>_test` is created on demand and emptied after every test.
"""

from collections.abc import AsyncGenerator

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from core_api import models  # noqa: F401 — registers models with Base.metadata
from core_api.config import settings
from core_api.db.session import get_db, unit_of_work
from core_api.main import app
from core_api.models.base import Base
from core_api.models.user import User
from travel_common.principal import Principal, Role
from travel_common.security import create_access_token

TEST_DB_NAME = f"{settings.DB_NAME}_test"
_SERVER = f"postgresql+asyncpg://{settings.DB_USER}:{settings.DB_PASSWORD}@{settings.DB_SERVER}:{settings.DB_PORT}"

# Engine for creating the test DB (connects to the default 'postgres' database)
setup_engine = create_async_engine(
    f"{_SERVER}/postgres", isolation_level="AUTOCOMMIT", poolclass=NullPool
)
engine_test = create_async_engine(f"{_SERVER}/{TEST_DB_NAME}", poolclass=NullPool)
AsyncSessionTest = async_sessionmaker(
    bind=engine_test, class_=AsyncSession, expire_on_commit=False
)


@pytest.fixture(scope="session")
async def setup_db():
    async with setup_engine.begin() as conn:
        exists = await conn.execute(
            text("SELECT 1 FROM pg_database WHERE datname = :name"),
            {"name": TEST_DB_NAME},
        )
        if not exists.scalar():
            await conn.execute(text(f'CREATE DATABASE "{TEST_DB_NAME}"'))

    async with engine_test.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)

    yield

    async with engine_test.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


@pytest.fixture
async def db_session(setup_db) -> AsyncGenerator[AsyncSession, None]:
    """A session per test, and an empty database when the test is over."""
    async with AsyncSessionTest() as session:
        yield session

    async with engine_test.begin() as conn:
        for table in reversed(Base.metadata.sorted_tables):
            await conn.execute(table.delete())


@pytest.fixture
async def client(db_session: AsyncSession) -> AsyncGenerator[AsyncClient, None]:
    """App client against the test database.

    Each request gets its own session and unit of work, exactly like
    production; `db_session` is only for arranging data in the test.
    """

    async def _get_test_db():
        async with AsyncSessionTest() as session, unit_of_work(session) as scoped:
            yield scoped

    app.dependency_overrides[get_db] = _get_test_db
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as ac:
        yield ac
    app.dependency_overrides.clear()


# ── Users and credentials ────────────────────────────────────────────────────


async def make_user(db: AsyncSession, email: str, role: Role = Role.USER) -> User:
    user = User(email=email, name=email.split("@")[0], is_active=True, role=role)
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


def headers_for(user: User) -> dict[str, str]:
    principal = Principal(id=user.id, email=user.email, role=user.role)
    return {"Authorization": f"Bearer {create_access_token(principal, settings)}"}


@pytest.fixture
async def alice(db_session: AsyncSession) -> User:
    return await make_user(db_session, "alice@example.com")


@pytest.fixture
async def bob(db_session: AsyncSession) -> User:
    return await make_user(db_session, "bob@example.com")


@pytest.fixture
async def admin(db_session: AsyncSession) -> User:
    return await make_user(db_session, "admin@example.com", Role.ADMIN)
