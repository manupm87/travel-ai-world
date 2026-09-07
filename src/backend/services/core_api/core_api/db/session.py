"""Async engine, session factory and the request-scoped unit of work."""

from collections.abc import AsyncGenerator, AsyncIterator
from contextlib import asynccontextmanager

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from core_api.config import settings

engine = create_async_engine(
    settings.SQLALCHEMY_DATABASE_URI,
    pool_pre_ping=True,
    echo=False,
)

AsyncSessionLocal = async_sessionmaker(
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


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with AsyncSessionLocal() as session, unit_of_work(session) as scoped:
        yield scoped
