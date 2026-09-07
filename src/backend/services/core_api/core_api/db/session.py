"""Engine and session factories, plus the request-scoped unit of work.

Nothing here runs at import time: `main.py` builds the engine in the app
lifespan and stores the session factory on `app.state`, so tests and tools
can configure the database without touching the environment first.
"""

from collections.abc import AsyncGenerator, AsyncIterator
from contextlib import asynccontextmanager

from fastapi import Request
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from core_api.config import CoreSettings

SessionFactory = async_sessionmaker[AsyncSession]


def build_engine(settings: CoreSettings, **overrides: object) -> AsyncEngine:
    options: dict[str, object] = {"pool_pre_ping": True, "echo": False, **overrides}
    return create_async_engine(settings.database_url, **options)


def build_session_factory(engine: AsyncEngine) -> SessionFactory:
    return async_sessionmaker(
        bind=engine,
        class_=AsyncSession,
        expire_on_commit=False,
        autocommit=False,
        autoflush=False,
    )


@asynccontextmanager
async def unit_of_work(session: AsyncSession) -> AsyncIterator[AsyncSession]:
    """One transaction per request: commit on success, roll back on any error.

    Repositories only `flush`; whoever owns the session decides when the work
    becomes durable, so a use case that writes several rows is atomic. Use it
    with `async with` (not by iterating) so an exception raised while the
    request runs reaches the `except` branch.
    """
    try:
        yield session
        await session.commit()
    except Exception:
        await session.rollback()
        raise


async def get_db(request: Request) -> AsyncGenerator[AsyncSession, None]:
    factory: SessionFactory = request.app.state.session_factory
    async with factory() as session, unit_of_work(session) as scoped:
        yield scoped
